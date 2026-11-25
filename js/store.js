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
    },
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

    initialize: function (callback, forceLocal = false) {
        this.subscribe(callback);

        if (forceLocal || !db) {
            console.log("Store: Inicializando en Modo Local (LocalStorage)...");
            this.isLocal = true;
            this._loadLocal();
            this._notify();
            return;
        }

        console.log("Store: Configurando listeners para la base de datos personal...");

        const getId = (val) => {
            if (!val) return null;
            if (typeof val === 'string') return val;
            if (val.id) return val.id;
            return val.toString();
        };

        let hasError = false;

        const catUnsub = db.collection("categories").onSnapshot(async snapshot => {
            console.log(`Store: Recibidas ${snapshot.docs.length} categorías.`);

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
                // Si falló escribir en Firestore (ej: bloqueo de reglas), poblar localmente de inmediato
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
            console.warn("Error o falta de permisos en Firestore categorías. Activando fallback local:", err);
            if (!this.isLocal) {
                this.isLocal = true;
                this._loadLocal();
                this._notify();
            }
        });

        const taskUnsub = db.collection("tasks").onSnapshot(snapshot => {
            console.log(`Store: Recibidas ${snapshot.docs.length} entradas.`);
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
                    attachments: Array.isArray(data.attachments) ? data.attachments : []
                };
            });

            this._notify();
        }, err => {
            console.warn("Error o falta de permisos en Firestore tareas. Activando fallback local:", err);
            if (!this.isLocal) {
                this.isLocal = true;
                this._loadLocal();
                this._notify();
            }
        });
    },

    _loadLocal() {
        const storedCats = localStorage.getItem('agenda_local_categories');
        const storedTasks = localStorage.getItem('agenda_local_tasks');

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
        if (this.isLocal || !db) {
            const newTask = {
                id: 'task_' + Date.now() + Math.random().toString(36).substr(2, 4),
                ...taskData
            };
            this.state.tasks.push(newTask);
            this._saveLocalTasks();
            this._notify();
            return newTask.id;
        }
        try {
            const ref = await db.collection("tasks").add(taskData);
            return ref.id;
        } catch (err) {
            console.warn("Fallo escribiendo tarea en Firestore (guardando local):", err);
            const newTask = {
                id: 'task_' + Date.now() + Math.random().toString(36).substr(2, 4),
                ...taskData
            };
            this.state.tasks.push(newTask);
            this._saveLocalTasks();
            this._notify();
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

    // --- Métodos de Acceso ---
    getTasks() { return this.state.tasks; },
    getCategories() { return this.state.categories; }
};
