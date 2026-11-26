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
                    reminderAt: data.reminderAt || null,
                    reminderCustomAt: data.reminderCustomAt || '',
                    reminderChannels: data.reminderChannels || { email: true, telegram: true },
                    reminderEmailTo: data.reminderEmailTo || '',
                    reminderSent: Boolean(data.reminderSent),
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
                    const fileTarget = att.fileId || att.path;
                    if (fileTarget) {
                        // Evitar borrar el archivo si otra tarea (ej. una copia) sigue usándolo
                        const usedElsewhere = this.state.tasks.some(
                            other => other.id !== taskId &&
                            Array.isArray(other.attachments) &&
                            other.attachments.some(a => (a.fileId || a.path) === fileTarget)
                        );
                        if (!usedElsewhere) {
                            try { await this.deleteAttachmentFile(fileTarget); } catch (e) { }
                        }
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

    // --- Utilidades de Recordatorios y Periodicidad ---
    computeReminderAt(startDate, time, reminder, customAt = '') {
        if (!reminder || reminder === 'none') return null;

        if (reminder === 'custom') {
            if (!customAt) return null;
            const dt = new Date(customAt);
            return isNaN(dt.getTime()) ? null : dt.toISOString();
        }

        if (!startDate) return null;
        const effectiveTime = (time && /^\d{2}:\d{2}/.test(time)) ? time : '09:00';
        const baseDate = new Date(`${startDate}T${effectiveTime}:00`);
        if (isNaN(baseDate.getTime())) return null;

        const offsetsMs = {
            'on_time': 0,
            '15m': 15 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000
        };
        const offset = offsetsMs[reminder] ?? 0;
        return new Date(baseDate.getTime() - offset).toISOString();
    },

    normalizeRecurrenceFreq(rawFreq) {
        if (!rawFreq) return 'none';
        const f = String(rawFreq).toLowerCase().trim();
        if (['days', 'day', 'dia', 'días', 'dias', 'daily', 'diario', 'diaria'].includes(f)) return 'days';
        if (['weeks', 'week', 'semana', 'semanas', 'weekly', 'semanal'].includes(f)) return 'weeks';
        if (['months', 'month', 'mes', 'meses', 'monthly', 'mensual'].includes(f)) return 'months';
        return 'none';
    },

    generateRecurrenceDates(startDateStr, endDateStr, recurrence) {
        const freq = this.normalizeRecurrenceFreq(recurrence?.freq || recurrence?.frequency || recurrence?.frecuencia);
        if (freq === 'none' || !startDateStr) {
            return [{ startDate: startDateStr, endDate: endDateStr || startDateStr }];
        }

        const interval = Math.max(1, parseInt(recurrence?.interval || recurrence?.cada || 1, 10) || 1);
        const untilStr = recurrence?.until || recurrence?.untilDate || recurrence?.hasta || '';
        const rawCount = parseInt(recurrence?.count || recurrence?.repeticiones || recurrence?.veces || 0, 10);
        const MAX_OCCURRENCES = 60;

        // Si se indica "until" sin count, generamos hasta esa fecha (con tope de 60)
        // Si no se indica ni until ni count, por defecto 6 repeticiones
        const targetCount = untilStr
            ? (rawCount > 0 ? Math.min(rawCount, MAX_OCCURRENCES) : MAX_OCCURRENCES)
            : Math.min(Math.max(rawCount || 6, 1), MAX_OCCURRENCES);

        const parseLocal = (s) => {
            const [y, m, d] = s.split('-').map(Number);
            return new Date(y, (m || 1) - 1, d || 1);
        };
        const fmtLocal = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        const baseStart = parseLocal(startDateStr);
        const baseEnd = endDateStr ? parseLocal(endDateStr) : new Date(baseStart.getTime());
        const durationDays = Math.max(0, Math.round((baseEnd.getTime() - baseStart.getTime()) / 86400000));
        const untilDate = untilStr ? parseLocal(untilStr) : null;

        const results = [];
        for (let i = 0; i < targetCount; i++) {
            let occStart;
            if (freq === 'days') {
                occStart = new Date(baseStart.getFullYear(), baseStart.getMonth(), baseStart.getDate() + (i * interval));
            } else if (freq === 'weeks') {
                occStart = new Date(baseStart.getFullYear(), baseStart.getMonth(), baseStart.getDate() + (i * interval * 7));
            } else if (freq === 'months') {
                // Suma segura de meses sin desbordar fin de mes (ej: 31 Ene -> 28 Feb -> 31 Mar)
                const targetMonthIndex = baseStart.getMonth() + (i * interval);
                const targetYear = baseStart.getFullYear() + Math.floor(targetMonthIndex / 12);
                const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
                const maxDayInMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
                const day = Math.min(baseStart.getDate(), maxDayInMonth);
                occStart = new Date(targetYear, normalizedMonth, day);
            }

            if (untilDate && occStart.getTime() > untilDate.getTime()) {
                break;
            }

            const occEnd = new Date(occStart.getFullYear(), occStart.getMonth(), occStart.getDate() + durationDays);
            results.push({
                startDate: fmtLocal(occStart),
                endDate: fmtLocal(occEnd)
            });
        }

        return results.length > 0 ? results : [{ startDate: startDateStr, endDate: endDateStr || startDateStr }];
    },

    async addRecurringTasks(baseTaskData, recurrence) {
        const freq = this.normalizeRecurrenceFreq(recurrence?.freq || recurrence?.frequency || recurrence?.frecuencia);
        const interval = Math.max(1, parseInt(recurrence?.interval || recurrence?.cada || 1, 10) || 1);
        const datesList = this.generateRecurrenceDates(baseTaskData.startDate, baseTaskData.endDate, recurrence);

        const groupId = datesList.length > 1
            ? ('rec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6))
            : null;

        const createdTasks = [];
        for (let i = 0; i < datesList.length; i++) {
            const { startDate, endDate } = datesList[i];
            const remType = baseTaskData.reminder || 'none';
            const computedReminderAt = (remType === 'custom' && i > 0)
                ? this.computeReminderAt(startDate, baseTaskData.time, 'on_time')
                : this.computeReminderAt(startDate, baseTaskData.time, remType, baseTaskData.reminderCustomAt || '');

            const itemData = {
                ...baseTaskData,
                startDate,
                endDate,
                reminderAt: computedReminderAt,
                reminderSent: false,
                recurrenceGroupId: groupId,
                recurrence: groupId ? {
                    freq,
                    interval,
                    index: i + 1,
                    total: datesList.length
                } : null
            };

            const newId = await this.addTask(itemData);
            createdTasks.push({ id: newId, ...itemData });
        }

        return { groupId, createdTasks };
    },

    // --- Métodos para Adjuntos (Opción A: Almacenamiento en Firestore) ---
    async uploadAttachment(file, onProgress) {
        if (!file) throw new Error("No se ha seleccionado ningún archivo.");

        // Límite de seguridad para Firestore: 15 MB
        const maxBytes = 15 * 1024 * 1024;
        if (file.size > maxBytes) {
            throw new Error(`El archivo "${file.name}" supera el tamaño máximo permitido de 15 MB para almacenamiento gratuito en la nube.`);
        }

        // Leer archivo a Data URL
        if (typeof onProgress === 'function') onProgress(10);
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error("Error leyendo el archivo en el dispositivo."));
            reader.readAsDataURL(file);
        });

        if (typeof onProgress === 'function') onProgress(30);

        // Si estamos en modo local sin conexión o sin Firestore
        if (this.isLocal || !db) {
            return {
                name: file.name,
                type: file.type || 'application/octet-stream',
                size: file.size || 0,
                url: dataUrl,
                path: 'local_' + Date.now() + '_' + file.name
            };
        }

        // Subir a Firestore dividido en trozos (chunks) seguros de 500.000 caracteres (<500 KB por doc)
        const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 7);
        const CHUNK_SIZE = 500000;
        const totalChunks = Math.ceil(dataUrl.length / CHUNK_SIZE);

        const fileMeta = {
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size || 0,
            chunkCount: totalChunks,
            createdAt: (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue) ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString()
        };

        if (totalChunks <= 1) {
            // Archivo pequeño (< 370 KB): cabe directamente en el documento principal
            fileMeta.data = dataUrl;
            await db.collection("file_storage").doc(fileId).set(fileMeta);
            if (typeof onProgress === 'function') onProgress(100);
        } else {
            // Archivo más grande (como PDFs de 700 KB a 10 MB): guardar metadatos y chunks
            await db.collection("file_storage").doc(fileId).set(fileMeta);

            for (let i = 0; i < totalChunks; i++) {
                const chunkStr = dataUrl.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                const chunkDocId = String(i).padStart(4, '0');
                await db.collection("file_storage").doc(fileId).collection("chunks").doc(chunkDocId).set({
                    index: i,
                    data: chunkStr
                });
                if (typeof onProgress === 'function') {
                    const pct = Math.round(30 + ((i + 1) / totalChunks) * 70);
                    onProgress(pct);
                }
            }
        }

        return {
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size || 0,
            fileId: fileId,
            path: fileId,
            url: null
        };
    },

    async getAttachmentBlobUrl(attachment) {
        if (!attachment) throw new Error("No hay información de archivo.");
        if (attachment._blobUrl) return attachment._blobUrl;

        // Si ya tiene una URL web válida o Blob
        if (attachment.url && (attachment.url.startsWith('http://') || attachment.url.startsWith('https://') || attachment.url.startsWith('blob:'))) {
            return attachment.url;
        }

        // Si es una Data URL ya en memoria o guardada localmente
        if (attachment.url && attachment.url.startsWith('data:')) {
            const blob = this._dataUrlToBlob(attachment.url, attachment.type);
            const blobUrl = URL.createObjectURL(blob);
            attachment._blobUrl = blobUrl;
            return blobUrl;
        }

        const fileId = attachment.fileId || attachment.path;
        if (!fileId || this.isLocal || !db) {
            if (attachment.url) return attachment.url;
            throw new Error("El archivo no está disponible sin conexión.");
        }

        // Recuperar desde la colección file_storage de Firestore
        const fileDoc = await db.collection("file_storage").doc(fileId).get();
        if (!fileDoc.exists) {
            // Respaldo por si fuera una referencia antigua de Firebase Storage
            if (typeof storage !== 'undefined' && storage && attachment.path && attachment.path.includes('/')) {
                try {
                    return await storage.ref().child(attachment.path).getDownloadURL();
                } catch (e) { }
            }
            throw new Error("El archivo no se encuentra en la base de datos.");
        }

        const meta = fileDoc.data();
        let fullDataUrl = '';

        if (meta.data) {
            fullDataUrl = meta.data;
        } else if (meta.chunkCount > 1) {
            const chunksSnap = await db.collection("file_storage").doc(fileId).collection("chunks").orderBy("index").get();
            const parts = [];
            chunksSnap.forEach(c => parts.push(c.data().data));
            fullDataUrl = parts.join('');
        }

        if (!fullDataUrl) {
            throw new Error("El contenido del archivo está vacío o dañado.");
        }

        const blob = this._dataUrlToBlob(fullDataUrl, meta.type || attachment.type);
        const blobUrl = URL.createObjectURL(blob);
        attachment._blobUrl = blobUrl;
        return blobUrl;
    },

    _dataUrlToBlob(dataUrl, defaultType = 'application/octet-stream') {
        const parts = dataUrl.split(',');
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : defaultType;
        const b64Data = parts[1] || '';
        const byteCharacters = atob(b64Data);
        const byteArrays = [];
        const sliceSize = 1024;

        for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
            const slice = byteCharacters.slice(offset, offset + sliceSize);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }
            byteArrays.push(new Uint8Array(byteNumbers));
        }

        return new Blob(byteArrays, { type: mime });
    },

    async deleteAttachmentFile(fileTarget) {
        if (!fileTarget || fileTarget.startsWith('local_')) return;

        // Eliminación de Firestore
        if (db && (fileTarget.startsWith('file_') || !fileTarget.includes('/'))) {
            try {
                const chunksSnap = await db.collection("file_storage").doc(fileTarget).collection("chunks").get();
                const batch = db.batch();
                chunksSnap.forEach(doc => batch.delete(doc.ref));
                batch.delete(db.collection("file_storage").doc(fileTarget));
                await batch.commit();
                console.log("Archivo eliminado de Firestore:", fileTarget);
            } catch (err) {
                console.warn("Error eliminando archivo de Firestore:", fileTarget, err);
            }
            return;
        }

        // Respaldo para Storage antiguo
        if (typeof storage !== 'undefined' && storage && fileTarget.includes('/')) {
            try {
                await storage.ref().child(fileTarget).delete();
            } catch (err) {
                console.warn("No se pudo eliminar el archivo de Storage:", fileTarget, err);
            }
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
