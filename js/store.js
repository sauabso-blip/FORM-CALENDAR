// store.js
// Conecta con Firebase Firestore y Firebase Storage para la Agenda Personal

let db = null;
let storage = null;

try {
    if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
        db = firebase.firestore();
        if (typeof firebase.storage === 'function') {
            storage = firebase.storage();
        }
    } else {
        console.error("Firebase no está inicializado. Verifica firebaseConfig.js y tu conexión a internet.");
    }
} catch (e) {
    console.error("Error fatal al acceder a Firebase:", e);
}

const DEFAULT_CATEGORIES = [
    { name: 'Tareas', color: '#3b82f6' },
    { name: 'Eventos sociales', color: '#ec4899' },
    { name: 'Introducción de gastos', color: '#10b981' },
    { name: 'Avisos', color: '#f59e0b' }
];

const store = {
    state: {
        categories: [],
        tasks: [],
        shares: []
    },
    activeCalendarFilter: 'mine', // 'mine' | 'all' | ownerEmail
    isLocal: false,
    _seededDefaults: false,
    _listeners: [],

    subscribe(fn) {
        if (typeof fn === 'function') this._listeners.push(fn);
    },

    _notify() {
        this._listeners.forEach(fn => {
            try { fn(); } catch (e) { console.error("Store listener error:", e); }
        });
    },

    getCurrentUser() {
        if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
            const u = firebase.auth().currentUser;
            const nameEl = document.getElementById('current-user-name');
            const userName = (nameEl && nameEl.textContent) ? nameEl.textContent.trim() : (u.displayName || (u.email ? u.email.split('@')[0] : 'Usuario'));
            return {
                uid: u.uid,
                email: (u.email || '').toLowerCase(),
                name: userName
            };
        }
        return {
            uid: 'local_user',
            email: 'local@agenda.personal',
            name: 'Modo Local'
        };
    },

    _updateSyncBadge(status, detail = '') {
        const badge = document.getElementById('sync-status-badge');
        if (!badge) return;
        if (status === 'cloud') {
            badge.textContent = '☁️ En la nube';
            badge.style.background = '#dcfce7';
            badge.style.color = '#15803d';
            badge.title = 'Conectado a Firebase Firestore. Tareas sincronizadas en tiempo real.';
            badge.onclick = null;
            badge.style.cursor = 'default';
        } else if (status === 'local') {
            badge.textContent = '⚠️ Modo Local';
            badge.style.background = '#fef3c7';
            badge.style.color = '#b45309';
            badge.title = 'Trabajando en almacenamiento local del dispositivo. Inicia sesión para sincronizar.';
            badge.onclick = null;
            badge.style.cursor = 'default';
        } else if (status === 'error') {
            badge.textContent = '❌ Error Nube';
            badge.style.background = '#fee2e2';
            badge.style.color = '#b91c1c';
            badge.title = 'Error en Firestore: ' + (detail || 'Permiso denegado') + '. Haz clic aquí para ver detalles.';
            badge.style.cursor = 'pointer';
            badge.onclick = () => {
                alert("❌ Error de conexión con Firebase Firestore:\n\n" + (detail || "Permiso denegado (Missing or insufficient permissions)") + "\n\nCausa habitual: Las Reglas de Seguridad en tu consola de Firebase están bloqueando el acceso.\n\nSolución:\n1. Entra en console.firebase.google.com\n2. Abre tu proyecto (personalcalendar-741d7)\n3. Ve a Firestore Database -> Pestaña Reglas (Rules)\n4. Pega:\n   allow read, write: if request.auth != null;\n5. Pulsa Publicar.");
            };
        }
    },

    initialize: function (callback, forceLocal = false) {
        if (typeof callback === 'function') this.subscribe(callback);

        // Cancelar listeners previos si existían
        if (this._unsubs && Array.isArray(this._unsubs)) {
            this._unsubs.forEach(unsub => { try { unsub(); } catch (e) { } });
        }
        this._unsubs = [];

        if (forceLocal || !db) {
            console.log("Store: Inicializando en Modo Local (LocalStorage)...");
            this.isLocal = true;
            this._loadLocal();
            this._updateSyncBadge('local');
            this._notify();
            return;
        }

        this.isLocal = false;
        console.log("Store: Conectando y configurando listeners en tiempo real con Firestore...");

        const getId = (val) => {
            if (!val) return null;
            if (typeof val === 'string') return val;
            if (val.id) return val.id;
            return val.toString();
        };

        const catUnsub = db.collection("categories").onSnapshot(async snapshot => {
            console.log(`Store: Recibidas ${snapshot.docs.length} categorías.`);
            this._updateSyncBadge('cloud');

            if (snapshot.empty && !this._seededDefaults) {
                this._seededDefaults = true;
                console.log("Store: Colección 'categories' vacía. Creando categorías iniciales por defecto...");
                let wroteToDb = true;
                for (const cat of DEFAULT_CATEGORIES) {
                    try {
                        await db.collection("categories").add(cat);
                    } catch (err) {
                        console.error("Error creando categoría inicial en Firestore:", cat.name, err);
                        wroteToDb = false;
                    }
                }
                if (!wroteToDb) {
                    this.state.categories = DEFAULT_CATEGORIES.map((c, idx) => ({
                        id: 'cat_' + (idx + 1),
                        name: c.name,
                        color: c.color
                    }));
                    this._saveLocalCategories();
                    this._notify();
                }
                return;
            }

            if (!snapshot.empty) {
                this.state.categories = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        color: data.color || data.Color || '#3b82f6'
                    };
                });
            } else if (!this.state.categories || this.state.categories.length === 0) {
                this._loadLocal();
            }

            this._notify();
        }, err => {
            console.warn("Aviso en listener de categorías en Firestore:", err);
            this._updateSyncBadge('error', err.message || err.code || String(err));
            if (!this.state.categories || this.state.categories.length === 0) {
                this._loadLocal();
                this._notify();
            }
        });
        this._unsubs.push(catUnsub);

        const taskUnsub = db.collection("tasks").onSnapshot(snapshot => {
            console.log(`Store: Recibidas ${snapshot.docs.length} entradas desde Firestore.`);
            this._updateSyncBadge('cloud');
            this.state.tasks = snapshot.docs.map(doc => {
                const data = doc.data();
                const rawCategoryId = data.categoryId || data.calendarId || data.calendar_id || data.category;
                return {
                    id: doc.id,
                    ...data,
                    categoryId: getId(rawCategoryId),
                    amount: (data.amount !== undefined && data.amount !== null && data.amount !== '') ? Number(data.amount) : null,
                    time: data.time || '',
                    reminder: data.reminder || 'none',
                    attachments: Array.isArray(data.attachments) ? data.attachments : [],
                    sharedWith: Array.isArray(data.sharedWith) ? data.sharedWith : []
                };
            });

            this._notify();
        }, err => {
            console.warn("Aviso en listener de tareas en Firestore:", err);
            this._updateSyncBadge('error', err.message || err.code || String(err));
            // No forzamos permanentemente modo local para permitir reintentos cuando el auth esté listo
            if (!this.state.tasks || this.state.tasks.length === 0) {
                this._loadLocal();
                this._notify();
            }
        });
        this._unsubs.push(taskUnsub);

        // Subscripción a calendarios compartidos
        const sharesUnsub = db.collection("calendar_shares").onSnapshot(snapshot => {
            console.log(`Store: Recibidos ${snapshot.docs.length} registros de calendarios compartidos.`);
            this.state.shares = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this._notify();
        }, err => {
            console.warn("Fallo en listener de calendar_shares:", err);
            this._loadLocalShares();
            this._notify();
        });
        this._unsubs.push(sharesUnsub);
    },

    _loadLocal() {
        const storedCats = localStorage.getItem('agenda_local_categories');
        const storedTasks = localStorage.getItem('agenda_local_tasks');
        this._loadLocalShares();

        if (storedCats) {
            try {
                this.state.categories = JSON.parse(storedCats);
            } catch (e) {
                this.state.categories = [];
            }
        }

        if (!this.state.categories || this.state.categories.length === 0) {
            this.state.categories = DEFAULT_CATEGORIES.map((c, idx) => ({
                id: 'cat_' + (idx + 1),
                name: c.name,
                color: c.color
            }));
            this._saveLocalCategories();
        }

        if (storedTasks) {
            try {
                this.state.tasks = JSON.parse(storedTasks);
            } catch (e) {
                this.state.tasks = [];
            }
        } else {
            // Seed a sample welcome task
            const todayStr = new Date().toISOString().split('T')[0];
            this.state.tasks = [
                {
                    id: 'task_demo_1',
                    name: 'Bienvenido a tu Agenda Personal',
                    description: 'Bienvenido a tu Agenda Personal',
                    comments: 'Puedes editar o eliminar esta tarea, adjuntar archivos o crear tus propios eventos y gastos.',
                    location: 'Local',
                    startDate: todayStr,
                    endDate: todayStr,
                    time: '10:00',
                    reminder: 'on_time',
                    amount: null,
                    categoryId: this.state.categories[0].id,
                    attachments: []
                }
            ];
            this._saveLocalTasks();
        }
    },

    _saveLocalCategories() {
        localStorage.setItem('agenda_local_categories', JSON.stringify(this.state.categories));
    },

    _saveLocalTasks() {
        localStorage.setItem('agenda_local_tasks', JSON.stringify(this.state.tasks));
    },

    _loadLocalShares() {
        const stored = localStorage.getItem('agenda_local_shares');
        if (stored) {
            try {
                this.state.shares = JSON.parse(stored);
            } catch (e) {
                this.state.shares = [];
            }
        } else {
            this.state.shares = [];
        }
    },

    _saveLocalShares() {
        localStorage.setItem('agenda_local_shares', JSON.stringify(this.state.shares));
    },

    // Sincroniza cualquier tarea creada previamente en modo local/offline hacia Firestore
    async syncLocalTasksToFirestore() {
        if (!db) return;
        const currentUser = this.getCurrentUser();
        if (!currentUser || !currentUser.email || currentUser.email === 'local@agenda.personal') return;

        const storedTasks = localStorage.getItem('agenda_local_tasks');
        if (!storedTasks) return;

        try {
            const localTasks = JSON.parse(storedTasks);
            if (!Array.isArray(localTasks) || localTasks.length === 0) return;

            console.log(`Store: Sincronizando ${localTasks.length} tarea(s) locales a Firestore para ${currentUser.email}...`);
            for (const t of localTasks) {
                if (t.id === 'task_demo_1') continue;

                const alreadyInState = this.state.tasks.some(st => st.id === t.id || (st.name === t.name && st.startDate === t.startDate));
                if (!alreadyInState) {
                    const taskToUpload = {
                        name: t.name || t.description || 'Sin título',
                        description: t.description || t.name || '',
                        comments: t.comments || '',
                        location: t.location || '',
                        startDate: t.startDate,
                        endDate: t.endDate,
                        time: t.time || '',
                        reminder: t.reminder || 'none',
                        amount: t.amount || null,
                        categoryId: t.categoryId,
                        attachments: t.attachments || [],
                        ownerEmail: currentUser.email.toLowerCase(),
                        ownerName: currentUser.name,
                        ownerUid: currentUser.uid,
                        sharedWith: t.sharedWith || []
                    };
                    await db.collection("tasks").add(taskToUpload);
                }
            }
            localStorage.removeItem('agenda_local_tasks');
            console.log("Store: Sincronización de tareas locales a Firestore finalizada.");
        } catch (e) {
            console.warn("Aviso durante sincronización de tareas locales:", e);
        }
    },

    // --- Métodos de Escritura (Categorías y Tareas) ---
    async addCategory(categoryData) {
        if (this.isLocal || !db) {
            const newCat = {
                id: 'cat_' + Date.now() + Math.random().toString(36).substr(2, 4),
                ...categoryData
            };
            this.state.categories.push(newCat);
            this._saveLocalCategories();
            this._notify();
            return newCat.id;
        }
        try {
            const ref = await db.collection("categories").add(categoryData);
            return ref.id;
        } catch (err) {
            console.warn("Fallo escribiendo categoría en Firestore (guardando local):", err);
            const newCat = {
                id: 'cat_' + Date.now() + Math.random().toString(36).substr(2, 4),
                ...categoryData
            };
            this.state.categories.push(newCat);
            this._saveLocalCategories();
            this._notify();
            return newCat.id;
        }
    },

    async updateCategory(id, data) {
        if (this.isLocal || !db) {
            const cat = this.state.categories.find(c => c.id === id);
            if (cat) {
                Object.assign(cat, data);
                this._saveLocalCategories();
                this._notify();
            }
            return;
        }
        try {
            await db.collection("categories").doc(id).update(data);
        } catch (err) {
            console.warn("Fallo actualizando categoría en Firestore (actualizando local):", err);
            const cat = this.state.categories.find(c => c.id === id);
            if (cat) {
                Object.assign(cat, data);
                this._saveLocalCategories();
                this._notify();
            }
        }
    },

    async deleteCategory(id) {
        if (this.isLocal || !db) {
            this.state.categories = this.state.categories.filter(c => c.id !== id);
            this._saveLocalCategories();
            this._notify();
            return;
        }
        try {
            await db.collection("categories").doc(id).delete();
        } catch (err) {
            console.warn("Fallo eliminando categoría en Firestore (eliminando local):", err);
            this.state.categories = this.state.categories.filter(c => c.id !== id);
            this._saveLocalCategories();
            this._notify();
        }
    },

    async addTask(taskData) {
        const currentUser = this.getCurrentUser();
        const dataWithOwner = {
            ...taskData,
            ownerEmail: (taskData.ownerEmail || currentUser.email).toLowerCase(),
            ownerName: taskData.ownerName || currentUser.name,
            ownerUid: taskData.ownerUid || currentUser.uid,
            sharedWith: Array.isArray(taskData.sharedWith) ? taskData.sharedWith.map(e => (e || '').trim().toLowerCase()).filter(Boolean) : []
        };

        const hasAuthUser = typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser;

        if ((this.isLocal && !hasAuthUser) || !db) {
            const newTask = {
                id: 'task_' + Date.now() + Math.random().toString(36).substr(2, 4),
                ...dataWithOwner
            };
            this.state.tasks.push(newTask);
            this._saveLocalTasks();
            this._notify();
            return newTask.id;
        }
        try {
            this.isLocal = false;
            const ref = await db.collection("tasks").add(dataWithOwner);
            this._updateSyncBadge('cloud');
            return ref.id;
        } catch (err) {
            console.error("Fallo escribiendo tarea en Firestore:", err);
            this._updateSyncBadge('error');
            const newTask = {
                id: 'task_' + Date.now() + Math.random().toString(36).substr(2, 4),
                ...dataWithOwner
            };
            this.state.tasks.push(newTask);
            this._saveLocalTasks();
            this._notify();
            if (err.code === 'permission-denied' || (err.message && err.message.toLowerCase().includes('permission'))) {
                alert("⚠️ Aviso Firebase (Permiso Denegado):\nLa tarea se ha guardado solo en este dispositivo porque las Reglas de Seguridad en tu consola de Firebase están bloqueando la escritura en la nube.\n\nPor favor, revisa la pestaña 'Reglas' en Firestore.");
            }
            return newTask.id;
        }
    },

    async updateTask(taskId, updatedData) {
        if (this.isLocal || !db) {
            const task = this.state.tasks.find(t => t.id === taskId);
            if (task) {
                Object.assign(task, updatedData);
                this._saveLocalTasks();
                this._notify();
            }
            return;
        }
        try {
            await db.collection("tasks").doc(taskId).update(updatedData);
        } catch (err) {
            console.warn("Fallo actualizando tarea en Firestore (actualizando local):", err);
            const task = this.state.tasks.find(t => t.id === taskId);
            if (task) {
                Object.assign(task, updatedData);
                this._saveLocalTasks();
                this._notify();
            }
        }
    },

    async deleteTask(taskId) {
        if (this.isLocal || !db) {
            this.state.tasks = this.state.tasks.filter(t => t.id !== taskId);
            this._saveLocalTasks();
            this._notify();
            return;
        }
        try {
            const task = this.state.tasks.find(t => t.id === taskId);
            if (task && Array.isArray(task.attachments)) {
                for (const att of task.attachments) {
                    if (att.path) {
                        try { await this.deleteAttachmentFile(att.path); } catch (e) { }
                    }
                }
            }
            await db.collection("tasks").doc(taskId).delete();
        } catch (err) {
            console.warn("Fallo eliminando tarea en Firestore (eliminando local):", err);
            this.state.tasks = this.state.tasks.filter(t => t.id !== taskId);
            this._saveLocalTasks();
            this._notify();
        }
    },

    // --- Métodos para Adjuntos ---
    async uploadAttachment(file) {
        if (this.isLocal || !storage) {
            // Conversión local a Data URL (permite ver fotos, reproducir audio, abrir PDF localmente)
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    resolve({
                        name: file.name,
                        type: file.type || 'application/octet-stream',
                        size: file.size || 0,
                        url: e.target.result,
                        path: 'local_' + Date.now() + '_' + file.name
                    });
                };
                reader.onerror = () => reject(new Error("Error leyendo archivo local"));
                reader.readAsDataURL(file);
            });
        }

        const user = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
        const uid = user ? user.uid : 'anonymous';
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `attachments/${uid}/${Date.now()}_${safeName}`;

        const storageRef = storage.ref().child(path);
        const snapshot = await storageRef.put(file);
        const url = await snapshot.ref.getDownloadURL();

        return {
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size || 0,
            url,
            path
        };
    },

    async deleteAttachmentFile(path) {
        if (this.isLocal || !storage || !path || path.startsWith('local_')) return;
        try {
            await storage.ref().child(path).delete();
        } catch (err) {
            console.warn("No se pudo eliminar el archivo de Storage:", path, err);
        }
    },

    // --- Métodos de Compartir Calendario ---
    getMyShares() {
        const currentUser = this.getCurrentUser();
        const email = currentUser.email.toLowerCase();
        return (this.state.shares || []).filter(s => (s.ownerEmail || '').toLowerCase() === email);
    },

    getSharedWithMe() {
        const currentUser = this.getCurrentUser();
        const email = currentUser.email.toLowerCase();
        return (this.state.shares || []).filter(s => (s.sharedWithEmail || '').toLowerCase() === email);
    },

    async shareCalendarWith(targetEmail) {
        if (!targetEmail) throw new Error("Debes indicar un correo electrónico.");
        targetEmail = targetEmail.trim().toLowerCase();
        const currentUser = this.getCurrentUser();
        
        if (targetEmail === currentUser.email.toLowerCase()) {
            throw new Error("No puedes compartir el calendario con tu propio correo.");
        }

        const existing = this.getMyShares().find(s => (s.sharedWithEmail || '').toLowerCase() === targetEmail);
        if (existing) {
            throw new Error(`Ya estás compartiendo tu calendario con "${targetEmail}".`);
        }

        // Obtener el nombre del usuario si está registrado
        let targetName = targetEmail.split('@')[0];
        if (db) {
            try {
                const uSnap = await db.collection("users").where("email", "==", targetEmail).limit(1).get();
                if (!uSnap.empty) {
                    const uData = uSnap.docs[0].data();
                    if (uData.name) targetName = uData.name;
                }
            } catch (e) {
                console.log("No se pudo consultar el nombre del usuario:", e);
            }
        }

        const shareData = {
            ownerEmail: currentUser.email.toLowerCase(),
            ownerName: currentUser.name,
            ownerUid: currentUser.uid,
            sharedWithEmail: targetEmail,
            sharedWithName: targetName,
            createdAt: new Date().toISOString()
        };

        if (this.isLocal || !db) {
            const newShare = { id: 'share_' + Date.now(), ...shareData };
            this.state.shares.push(newShare);
            this._saveLocalShares();
            this._notify();
            return newShare;
        }

        try {
            const docId = `${encodeURIComponent(currentUser.email)}_TO_${encodeURIComponent(targetEmail)}`;
            await db.collection("calendar_shares").doc(docId).set(shareData);
            return { id: docId, ...shareData };
        } catch (err) {
            console.warn("Fallo guardando en Firestore calendar_shares (guardando local):", err);
            const newShare = { id: 'share_' + Date.now(), ...shareData };
            this.state.shares.push(newShare);
            this._saveLocalShares();
            this._notify();
            return newShare;
        }
    },

    async revokeCalendarShare(shareId) {
        if (this.isLocal || !db) {
            this.state.shares = this.state.shares.filter(s => s.id !== shareId);
            this._saveLocalShares();
            this._notify();
            return;
        }
        try {
            await db.collection("calendar_shares").doc(shareId).delete();
        } catch (err) {
            console.warn("Error revocando share en Firestore (eliminando local):", err);
            this.state.shares = this.state.shares.filter(s => s.id !== shareId);
            this._saveLocalShares();
            this._notify();
        }
    },

    setActiveCalendarFilter(filter) {
        this.activeCalendarFilter = filter || 'mine';
        this._notify();
    },

    getActiveCalendarFilter() {
        return this.activeCalendarFilter || 'mine';
    },

    isSharedTask(task) {
        if (!task) return false;
        const currentUser = this.getCurrentUser();
        const userEmail = currentUser.email.toLowerCase();
        const taskOwner = (task.ownerEmail || userEmail).toLowerCase();
        return taskOwner !== userEmail;
    },

    isIndividuallySharedWithMe(task) {
        if (!task) return false;
        const currentUser = this.getCurrentUser();
        const userEmail = currentUser.email.toLowerCase();
        const sharedWithList = Array.isArray(task.sharedWith) ? task.sharedWith.map(e => (e || '').toLowerCase()) : [];
        return sharedWithList.includes(userEmail);
    },

    // --- Métodos de Acceso ---
    getTasks() {
        const currentUser = this.getCurrentUser();
        const userEmail = currentUser.email.toLowerCase();
        const sharedWithMe = this.getSharedWithMe();
        const sharedEmails = sharedWithMe.map(s => (s.ownerEmail || '').toLowerCase());
        const filter = (this.activeCalendarFilter || 'mine').toLowerCase();

        return this.state.tasks.filter(task => {
            // Si la tarea es antigua sin ownerEmail, la consideramos de este usuario para no perderla
            const taskOwner = (task.ownerEmail || userEmail).toLowerCase();
            const sharedWithList = Array.isArray(task.sharedWith) ? task.sharedWith.map(e => (e || '').toLowerCase()) : [];
            const isSingleTaskSharedWithMe = sharedWithList.includes(userEmail);
            const isCalendarSharedWithMe = sharedEmails.includes(taskOwner);

            if (filter === 'mine') {
                // En mi agenda veo mis tareas + tareas que me hayan compartido puntualmente
                return taskOwner === userEmail || isSingleTaskSharedWithMe;
            } else if (filter === 'all') {
                return taskOwner === userEmail || isCalendarSharedWithMe || isSingleTaskSharedWithMe;
            } else {
                return taskOwner === filter && (isCalendarSharedWithMe || isSingleTaskSharedWithMe);
            }
        });
    },

    getAllTasksRaw() {
        return this.state.tasks;
    },

    getCategories() { return this.state.categories; }
};
