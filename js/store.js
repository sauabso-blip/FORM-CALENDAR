/**
 * Store - Global State Management
 */
(function () {
    const STORAGE_KEY = 'projectCalendar_data_v1';
    const utils = window.AppUtils; // Shorthand

    const defaultData = {
        projects: [
            { id: 'p1', name: 'Proyecto Alpha', color: '#ef4444' },
            { id: 'p2', name: 'Campaña Marketing', color: '#10b981' },
            { id: 'p3', name: 'Mantenimiento', color: '#f59e0b' }
        ],
        people: [
            { id: 'u1', name: 'Juan Pérez' },
            { id: 'u2', name: 'Ana Gómez' },
            { id: 'u3', name: 'Carlos Ruiz' }
        ],
        executors: [],
        tasks: [
            {
                id: 't1',
                projectId: 'p1',
                assignee: 'u1',
                description: 'Inicio de análisis',
                start: new Date().getFullYear() + '-01-10',
                end: new Date().getFullYear() + '-01-15',
                year: new Date().getFullYear()
            }
        ]
    };

    class Store {
        constructor() {
            this.data = this.load();
            this.listeners = [];
            this.ensureDataStructure();
        }

        load() {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                return JSON.parse(stored);
            }
            return defaultData;
        }

        ensureDataStructure() {
            if (!this.data.people) this.data.people = [...defaultData.people];
            if (!this.data.executors) this.data.executors = [];
            if (!this.data.projects) this.data.projects = [...defaultData.projects];
            if (!this.data.tasks) this.data.tasks = [];
        }

        save() {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
            this.notify();
        }

        subscribe(listener) {
            this.listeners.push(listener);
        }

        notify() {
            this.listeners.forEach(fn => fn(this.data));
        }

        // Projects
        getProjects() {
            return this.data.projects;
        }

        getProject(id) {
            return this.data.projects.find(p => p.id === id);
        }

        addProject(name, color) {
            const newProject = {
                id: utils.generateId(),
                name,
                color
            };
            this.data.projects.push(newProject);
            this.save();
            return newProject;
        }

        deleteProject(id) {
            this.data.projects = this.data.projects.filter(p => p.id !== id);
            this.data.tasks = this.data.tasks.filter(t => t.projectId !== id);
            this.save();
        }

        updateProject(id, { name, color }) {
            const p = this.getProject(id);
            if (p) {
                if (name) p.name = name;
                if (color) p.color = color;
                this.save();
            }
        }

        // People
        getPeople() {
            return this.data.people;
        }

        getPerson(id) {
            return this.data.people.find(p => p.id === id);
        }

        addPerson(name) {
            const p = { id: utils.generateId(), name };
            this.data.people.push(p);
            this.save();
            return p;
        }

        deletePerson(id) {
            this.data.people = this.data.people.filter(p => p.id !== id);
            this.data.tasks.forEach(t => {
                if (t.assignee === id) t.assignee = null;
            });
            this.save();
        }

        updatePerson(id, name) {
            const p = this.getPerson(id);
            if (p) {
                p.name = name;
                this.save();
            }
        }

        // Executors (New "Asignado a")
        getExecutors() {
            return this.data.executors || [];
        }

        addExecutor(name) {
            if (!this.data.executors) this.data.executors = [];
            const p = { id: utils.generateId(), name };
            this.data.executors.push(p);
            this.save();
            return p;
        }

        deleteExecutor(id) {
            if (!this.data.executors) return;
            this.data.executors = this.data.executors.filter(p => p.id !== id);
            // Clear ref in tasks
            this.data.tasks.forEach(t => {
                if (t.executorId === id) t.executorId = null;
            });
            this.save();
        }

        updateExecutor(id, name) {
            const p = this.data.executors ? this.data.executors.find(e => e.id === id) : null;
            if (p) {
                p.name = name;
                this.save();
            }
        }

        // Tasks
        getTasks() {
            return this.data.tasks;
        }

        addTask(taskData) {
            const newTask = {
                id: utils.generateId(),
                ...taskData
            };
            this.data.tasks.push(newTask);
            this.save();
            return newTask;
        }

        updateTask(id, updatedData) {
            const index = this.data.tasks.findIndex(t => t.id === id);
            if (index !== -1) {
                this.data.tasks[index] = { ...this.data.tasks[index], ...updatedData };
                this.save();
            }
        }

        deleteTask(id) {
            this.data.tasks = this.data.tasks.filter(t => t.id !== id);
            this.save();
        }

        getAssignees() {
            return this.data.people || [];
        }

        // Backup/Restore
        getRawData() {
            return JSON.stringify(this.data, null, 2);
        }

        importData(jsonString) {
            try {
                const parsed = JSON.parse(jsonString);
                // Validate minimal structure
                if (parsed.projects && parsed.people && parsed.tasks) {
                    this.data = parsed;
                    this.save();
                    return true;
                } else {
                    return false;
                }
            } catch (e) {
                console.error(e);
                return false;
            }
        }
    }

    // Expose Global
    window.AppStore = new Store();
})();
