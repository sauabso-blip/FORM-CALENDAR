
// store.js
// Conecta con Firebase
// store.js
// Conecta con Firebase

// Verificar si Firebase está disponible antes de intentar usarlo
let db = null;
try {
    if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
        db = firebase.firestore();
    } else {
        console.error("Firebase no está inicializado. Verifica firebaseConfig.js y tu conexión a internet.");
        // Opcional: Mostrar alerta visible si es crítico
    }
} catch (e) {
    console.error("Error fatal al acceder a Firestore:", e);
}

// Si db es null, las llamadas fallarán, pero manejaremos eso en los métodos o inicialización.

const store = {
    state: {
        projects: [],
        tasks: [],
        people: [],
        executors: [],
    },

    initialize: function (callback) {
        if (!db) {
            console.warn("Store: Base de datos no inicializada. Abortando listeners.");
            alert("No se ha podido conectar a la base de datos. Verifica tu configuración en js/firebaseConfig.js");
            return;
        }

        console.log("Store: Configurando listeners para la base de datos...");

        // El error anterior era una lógica de 'todo o nada'. Si una colección faltaba,
        // la aplicación no se renderizaba nunca. 
        // La nueva lógica es 'muestra los datos en cuanto lleguen', llamando al callback
        // cada vez que un listener de onSnapshot devuelve datos. Esto es más robusto.

        // Helper to safely extract ID from string or Firestore Reference
        const getId = (val) => {
            if (!val) return null;
            if (typeof val === 'string') return val;
            if (val.id) return val.id; // Handle Firestore DocumentReference
            return val.toString();
        };

        db.collection("projects").onSnapshot(snapshot => {
            console.log(`Store: Recibidos ${snapshot.docs.length} proyectos.`);
            this.state.projects = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    // Normalize fields: ensure 'color' exists
                    color: data.color || data.Color || '#cccccc'
                };
            });
            // Debug: Log first project to check structure
            if (this.state.projects.length > 0) console.log("Debug Project[0]:", this.state.projects[0]);

            callback(); // Renderiza la app
        }, err => console.error("Error al obtener proyectos: ", err));

        db.collection("tasks").onSnapshot(snapshot => {
            console.log(`Store: Recibidas ${snapshot.docs.length} tareas.`);
            this.state.tasks = snapshot.docs.map(doc => {
                const data = doc.data();
                const rawProjectId = data.projectId || data.project_id || data.project;
                return {
                    id: doc.id,
                    ...data,
                    // Normalize fields and handle References
                    projectId: getId(rawProjectId),
                    personId: getId(data.personId || data.person_id || data.person),
                    executorId: getId(data.executorId || data.executor_id || data.executor)
                };
            });
            // Debug: Log first task to check linking
            if (this.state.tasks.length > 0) {
                const t = this.state.tasks[0];
                console.log("Debug Task[0]:", t, "Linked Project ID:", t.projectId);
            }

            callback(); // Renderiza la app
        }, err => console.error("Error al obtener tareas: ", err));

        db.collection("people").onSnapshot(snapshot => {
            console.log(`Store: Recibidas ${snapshot.docs.length} personas.`);
            this.state.people = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(); // Renderiza la app con los datos que han llegado
        }, err => console.error("Error al obtener personas: ", err));

        db.collection("executors").onSnapshot(snapshot => {
            console.log(`Store: Recibidos ${snapshot.docs.length} ejecutores.`);
            this.state.executors = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(); // Renderiza la app con los datos que han llegado
        }, err => console.error("Error al obtener ejecutores: ", err));
    },

    // --- Métodos de Escritura ---
    async addProject(projectData) { // Acepta un objeto para más flexibilidad
        if (!db) return;
        await db.collection("projects").add(projectData);
    },

    async addTask(taskData) {
        if (!db) return;
        await db.collection("tasks").add(taskData);
    },

    async updateTask(taskId, updatedData) {
        if (!db) return;
        await db.collection("tasks").doc(taskId).update(updatedData);
    },

    async deleteTask(taskId) {
        if (!db) return;
        await db.collection("tasks").doc(taskId).delete();
    },

    async addPerson(name) {
        if (!db) return;
        await db.collection("people").add({ name });
    },
    async deletePerson(id) {
        if (!db) return;
        await db.collection("people").doc(id).delete();
    },
    async addExecutor(name) {
        if (!db) return;
        await db.collection("executors").add({ name });
    },
    async deleteExecutor(id) {
        if (!db) return;
        await db.collection("executors").doc(id).delete();
    },
    async updatePerson(id, data) {
        if (!db) return;
        await db.collection("people").doc(id).update(data);
    },
    async updateExecutor(id, data) {
        if (!db) return;
        await db.collection("executors").doc(id).update(data);
    },
    async updateProject(id, data) {
        if (!db) return;
        await db.collection("projects").doc(id).update(data);
    },
    async deleteProject(id) {
        if (!db) return;
        await db.collection("projects").doc(id).delete();
    },

    // --- Métodos de Acceso (Leen del estado local) ---
    getTasks() { return this.state.tasks; },
    getProjects() { return this.state.projects; },
    getPeople() { return this.state.people; },
    getExecutors() { return this.state.executors; }
};
