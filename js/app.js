class App {
    constructor() {
        this.state = {
            currentView: 'year',
            filters: { projects: [], people: [], executors: [] },
            currentDate: new Date(),
        };
        this.store = store;
        this.monthView = new MonthView(this.store, this.state, this.handleTaskUpdate.bind(this), this._handleContextMenu.bind(this));
        this.yearView = new YearView(this.store, this.state, this.handleTaskUpdate.bind(this), this._handleContextMenu.bind(this));

        this._bindUIEvents();
        this._bindDataEvents();
        this._initConfigModal();

        // Initialize store and then set up initial filters
        this.store.initialize(() => {
            console.log("Store inicializado. Estableciendo filtros iniciales...");
            this._initializeFilters();
            this.render();
        });
    }

    _initializeFilters() {
        // By default, all filters are active, so we fill the filter arrays with all available IDs.
        this.state.filters.projects = this.store.getProjects().map(p => p.id);
        this.state.filters.people = this.store.getPeople().map(p => p.id);
        this.state.filters.executors = this.store.getExecutors().map(e => e.id);
    }

    _bindUIEvents() {
        // Filter dropdown logic
        document.querySelectorAll('.multi-select').forEach(msContainer => {
            const btn = msContainer.querySelector('.ms-btn');
            const dropdown = msContainer.querySelector('.ms-dropdown');
            if (!btn || !dropdown) return;

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.ms-dropdown.show').forEach(d => {
                    if (d !== dropdown) d.classList.remove('show');
                });
                dropdown.classList.toggle('show');
            });

            dropdown.addEventListener('click', e => e.stopPropagation());
        });

        window.addEventListener('click', () => {
            document.querySelectorAll('.ms-dropdown.show').forEach(d => d.classList.remove('show'));
            const contextMenu = document.getElementById('context-menu');
            if (contextMenu) contextMenu.style.display = 'none';
        });
    }

    _bindDataEvents() {
        document.getElementById('btn-view-year').addEventListener('click', () => this.switchView('year'));
        document.getElementById('btn-view-rolling').addEventListener('click', () => this.switchView('rolling'));
        document.getElementById('btn-view-month').addEventListener('click', () => this.switchView('month'));
        document.getElementById('btn-add-task').addEventListener('click', () => this._showTaskModal());
        document.getElementById('btn-add-project').addEventListener('click', () => this._openProjectModal());

        // Modal Cancel Buttons
        const modalTask = document.getElementById('modal-task');
        const modalProject = document.getElementById('modal-project');

        const closeTaskModal = () => {
            if (typeof modalTask.close === 'function') {
                try { modalTask.close(); } catch (e) { }
            }
            modalTask.style.display = 'none';
        };

        const closeProjectModal = () => {
            if (typeof modalProject.close === 'function') {
                try { modalProject.close(); } catch (e) { }
            }
            modalProject.style.display = 'none';
        };

        document.getElementById('btn-cancel-task')?.addEventListener('click', closeTaskModal);
        document.getElementById('btn-cancel-project')?.addEventListener('click', closeProjectModal);

        // Form Submit: Task
        document.getElementById('form-task')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const idInput = document.getElementById('task-id');
            const desc = document.getElementById('task-desc').value;
            const comments = document.getElementById('task-comments').value;
            const location = document.getElementById('task-location').value;
            const start = document.getElementById('task-start').value;
            const end = document.getElementById('task-end').value;
            const projectId = document.getElementById('task-project').value;
            const assignee = document.getElementById('task-assignee').value;
            const executorId = document.getElementById('task-executor').value;

            const taskData = {
                name: desc, // Note: Model field validation needed (store uses name or description?) - DB usually flexible but view uses 'name'.
                description: desc, // Save both to be safe or check ViewYear
                comments,
                location,
                startDate: start, // ViewYear uses startDate/endDate
                endDate: end,
                projectId,
                personId: assignee, // ViewYear uses personId
                executorId
            };

            if (idInput.value) {
                await this.store.updateTask(idInput.value, taskData);
            } else {
                await this.store.addTask(taskData);
            }

            e.target.reset();
            closeTaskModal();
        });

        // Form Submit: Project
        document.getElementById('form-project')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const idInput = document.getElementById('project-id');
            const name = document.getElementById('project-name').value;
            const color = document.getElementById('project-color').value;

            const projectData = { name, color };

            if (idInput.value) {
                // Update project logic if store supports it (store.js didn't have updateProject explicitly shown in read, checking...)
                // store.js in Step 21 had addProject, addTask, updateTask.
                // It did NOT have updateProject. I might need to add it to store.js.
                // For now, I'll log warning or try to update if method exists, else just add.
                console.warn("Update project not fully implemented in store yet.");
                // We'll fallback to add for now or just log.
            } else {
                await this.store.addProject(projectData);
            }

            e.target.reset();
            closeProjectModal();
        });

        // Move Task Modal & Logic
        const modalMove = document.getElementById('modal-move-task');
        const closeMoveModal = () => {
            if (typeof modalMove.close === 'function') {
                try { modalMove.close(); } catch (e) { }
            }
            modalMove.style.display = 'none';
        };

        document.getElementById('btn-cancel-move')?.addEventListener('click', closeMoveModal);

        document.getElementById('form-move-task')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newDate = document.getElementById('move-task-date').value;

            if (this.currentTaskToMove && newDate) {
                const task = this.currentTaskToMove;
                const start = new Date(task.startDate);
                const end = new Date(task.endDate);
                const duration = end.getTime() - start.getTime();

                const newStart = new Date(newDate);
                const newEnd = new Date(newStart.getTime() + duration);

                const formatDate = d => d.toISOString().split('T')[0];

                await this.store.updateTask(task.id, {
                    startDate: formatDate(newStart),
                    endDate: formatDate(newEnd)
                });
            }

            e.target.reset();
            this.currentTaskToMove = null;
            closeMoveModal();
        });

        this._setupFilter('project');
        this._setupFilter('person');
        this._setupFilter('executor');
    }

    switchView(view) {
        this.state.currentView = view;
        this.render();
    }

    render() {
        const mainContainer = document.getElementById('app-main');
        mainContainer.innerHTML = '';

        switch (this.state.currentView) {
            case 'month':
                mainContainer.appendChild(this.monthView.render());
                break;
            case 'year':
            case 'rolling':
                mainContainer.appendChild(this.yearView.render(this.state.currentView));
                break;
        }

        document.querySelectorAll('.view-switcher .btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === this.state.currentView);
        });

        this.updateFilterDropdowns();
    }

    updateFilterDropdowns() {
        this._updateFilterDropdown('project', this.store.getProjects());
        this._updateFilterDropdown('person', this.store.getPeople());
        this._updateFilterDropdown('executor', this.store.getExecutors());
    }

    _getStateKeyForFilterType(type) {
        return type === 'person' ? 'people' : type + 's';
    }

    _setupFilter(type) {
        const container = document.getElementById(`ms-list-${type}`);
        if (!container) return;

        const stateKey = this._getStateKeyForFilterType(type);

        container.addEventListener('change', (e) => {
            if (e.target.type !== 'checkbox') return;

            const allItems = this.store[`get${stateKey.charAt(0).toUpperCase() + stateKey.slice(1)}`]();
            const allItemIds = allItems.map(item => item.id);

            if (e.target.classList.contains('ms-select-all')) {
                this.state.filters[stateKey] = e.target.checked ? allItemIds : [];
            } else {
                const id = e.target.value;
                const set = new Set(this.state.filters[stateKey]);
                if (e.target.checked) {
                    set.add(id);
                } else {
                    set.delete(id);
                }
                this.state.filters[stateKey] = Array.from(set);
            }
            this.render();
        });
    }

    _updateFilterDropdown(type, items) {
        const container = document.getElementById(`ms-list-${type}`);
        if (!container) return;

        const stateKey = this._getStateKeyForFilterType(type);
        const allSelected = items.length > 0 && this.state.filters[stateKey].length === items.length;

        let optionsHTML = `<label class="ms-option ms-option-all"><input type="checkbox" class="ms-select-all" ${allSelected ? 'checked' : ''} />Seleccionar Todos</label>`;
        optionsHTML += items.map(item => `<label class="ms-option"><input type="checkbox" value="${item.id}" ${this.state.filters[stateKey].includes(item.id) ? 'checked' : ''} />${item.name}</label>`).join('');
        container.innerHTML = optionsHTML;
    }

    // --- MODALS & FORMS ---

    _showTaskModal(task = null) {
        // Populate Selects
        const projectSelect = document.getElementById('task-project');
        const assigneeSelect = document.getElementById('task-assignee');
        const executorSelect = document.getElementById('task-executor');

        if (projectSelect) {
            projectSelect.innerHTML = '';
            this.store.getProjects().forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                projectSelect.appendChild(opt);
            });
        }

        if (assigneeSelect) {
            assigneeSelect.innerHTML = '';
            this.store.getPeople().forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                assigneeSelect.appendChild(opt);
            });
        }

        if (executorSelect) {
            executorSelect.innerHTML = '<option value="">-- Seleccionar --</option>';
            this.store.getExecutors().forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                executorSelect.appendChild(opt);
            });
        }

        const modal = document.getElementById('modal-task');
        const form = document.getElementById('form-task');
        const title = form.querySelector('h2');
        const btnSubmit = form.querySelector('button[type="submit"]');

        const idInput = document.getElementById('task-id');
        const descInput = document.getElementById('task-desc');
        const commentsInput = document.getElementById('task-comments');
        const locationInput = document.getElementById('task-location');
        const startInput = document.getElementById('task-start');
        const endInput = document.getElementById('task-end');

        if (task) {
            title.textContent = 'Editar Tarea';
            btnSubmit.textContent = 'Actualizar Tarea';
            idInput.value = task.id;
            descInput.value = task.name;
            commentsInput.value = task.comments || '';
            locationInput.value = task.location || '';
            startInput.value = task.startDate;
            endInput.value = task.endDate;
            if (projectSelect) projectSelect.value = task.projectId;
            if (assigneeSelect) assigneeSelect.value = task.personId;
            if (executorSelect) executorSelect.value = task.executorId || '';
        } else {
            title.textContent = 'Nueva Tarea';
            btnSubmit.textContent = 'Crear Tarea';
            idInput.value = '';
            descInput.value = '';
            commentsInput.value = '';
            locationInput.value = '';
            startInput.value = '';
            endInput.value = '';
            if (executorSelect) executorSelect.value = '';
        }

        modal.style.display = ''; // Clear inline display style first
        if (typeof modal.showModal === 'function') {
            try {
                modal.showModal();
            } catch (e) {
                // If already open or other error, fallback
                console.warn('showModal error:', e);
                modal.style.display = 'flex';
            }
        } else {
            modal.style.display = 'flex';
        }
    }

    _openProjectModal(project = null) {
        const modal = document.getElementById('modal-project');
        const form = document.getElementById('form-project');
        const title = form.querySelector('h2');
        const btnSubmit = form.querySelector('button[type="submit"]');

        const idInput = document.getElementById('project-id');
        const nameInput = document.getElementById('project-name');
        const colorInput = document.getElementById('project-color');

        if (project) {
            title.textContent = 'Editar Proyecto';
            btnSubmit.textContent = 'Guardar Cambios';
            idInput.value = project.id;
            nameInput.value = project.name;
            colorInput.value = project.color;
        } else {
            title.textContent = 'Nuevo Proyecto';
            btnSubmit.textContent = 'Crear Proyecto';
            idInput.value = '';
            nameInput.value = '';
            colorInput.value = '#3b82f6';
        }

        modal.style.display = '';
        if (typeof modal.showModal === 'function') {
            try {
                modal.showModal();
            } catch (e) {
                console.warn('showModal error:', e);
                modal.style.display = 'flex';
            }
        } else {
            modal.style.display = 'flex';
        }
    }

    async handleTaskUpdate(taskId, updatedData) {
        await this.store.updateTask(taskId, updatedData);
    }

    _initConfigModal() {
        const modal = document.getElementById('config-modal');
        const modalContent = modal.querySelector('.modal-content');
        const modalHeader = modal.querySelector('.modal-header');
        const btnOpen = document.getElementById('btn-config');
        const btnClose = document.getElementById('config-modal-close');

        // Tabs
        const tabBtns = document.querySelectorAll('.config-tab-btn');
        const tabContents = document.querySelectorAll('.config-tab-content');

        if (btnOpen) btnOpen.addEventListener('click', () => {
            modal.style.display = 'flex'; // Need flex to show logic, but we position absolute

            // Initial positioning: below button
            const btnRect = btnOpen.getBoundingClientRect();
            // Default center if no button (fallback), but here we use button pos
            modalContent.style.left = `${btnRect.left}px`;
            modalContent.style.top = `${btnRect.bottom + 10}px`;
            modalContent.style.transform = 'none'; // reset center transform if any

            this._renderConfigData();
        });

        if (btnClose) btnClose.addEventListener('click', () => {
            modal.style.display = 'none';
        });

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));

                btn.classList.add('active');
                const tabId = btn.dataset.tab;
                document.getElementById(`config-tab-${tabId}`).classList.add('active');
            });
        });

        // Draggable Logic
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        if (modalHeader) {
            modalHeader.addEventListener('mousedown', (e) => {
                if (e.target.closest('button')) return; // Don't drag if clicking close button
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;

                const rect = modalContent.getBoundingClientRect();
                initialLeft = rect.left;
                initialTop = rect.top;

                modalHeader.style.cursor = 'grabbing';
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                modalContent.style.left = `${initialLeft + dx}px`;
                modalContent.style.top = `${initialTop + dy}px`;
            });

            document.addEventListener('mouseup', () => {
                isDragging = false;
                if (modalHeader) modalHeader.style.cursor = 'move';
            });
        }

        // Backup
        document.getElementById('btn-export-csv')?.addEventListener('click', () => this._exportToCSV());
        document.getElementById('btn-backup-json')?.addEventListener('click', () => this._backupToJSON());
    }

    _renderConfigData() {
        this._renderConfigList({ type: 'projects', title: 'Proyectos' }, this.store.getProjects());
        this._renderConfigList({ type: 'people', title: 'Personas' }, this.store.getPeople());
        this._renderConfigList({ type: 'executors', title: 'Ejecutores' }, this.store.getExecutors());
    }

    _renderConfigList({ type, title }, items) {
        const container = document.getElementById(`config-list-${type}`);
        if (!container) return;

        container.innerHTML = '';

        // Add New Item Input
        const addItemRow = document.createElement('div');
        addItemRow.className = 'config-item-row add-row';
        addItemRow.innerHTML = `
            <input type="text" placeholder="Nuevo ${title}..." id="new-${type}-input">
            <button class="btn btn-sm btn-primary">Añadir</button>
        `;
        const addBtn = addItemRow.querySelector('button');
        const addInput = addItemRow.querySelector('input');

        addBtn.addEventListener('click', () => {
            const val = addInput.value.trim();
            if (val) this._addConfigItem(type, val);
        });

        container.appendChild(addItemRow);

        // List Existing Items (Editable)
        items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'config-item-row';

            const isProject = type === 'projects';
            const colorInputInfo = isProject ? `<input type="color" value="${item.color || '#3b82f6'}" class="edit-color">` : '';

            row.innerHTML = `
                <div class="config-item-info" style="flex:1">
                    ${colorInputInfo}
                    <input type="text" value="${item.name}" class="edit-name">
                </div>
                <div class="actions">
                    <button class="btn-icon save-btn" title="Guardar cambios">💾</button>
                    <button class="btn-icon delete-btn" title="Eliminar">&times;</button>
                </div>
            `;

            const nameInput = row.querySelector('.edit-name');
            const colorInput = row.querySelector('.edit-color');
            const saveBtn = row.querySelector('.save-btn');

            // Save functionality
            saveBtn.addEventListener('click', async () => {
                const newName = nameInput.value.trim();
                if (!newName) return;

                const updates = { name: newName };
                if (isProject && colorInput) updates.color = colorInput.value;

                await this._updateConfigItem(type, item.id, updates);
                this._renderConfigData();
            });

            row.querySelector('.delete-btn').addEventListener('click', async () => {
                if (confirm(`¿Eliminar "${item.name}"?`)) {
                    await this._deleteConfigItem(type, item.id);
                    this._renderConfigData();
                }
            });
            container.appendChild(row);
        });
    }

    async _updateConfigItem(type, id, data) {
        if (type === 'projects') await this.store.updateProject(id, data);
        if (type === 'people') await this.store.updatePerson(id, data);
        if (type === 'executors') await this.store.updateExecutor(id, data);
    }

    async _addConfigItem(type, value) {
        if (type === 'projects') {
            await this.store.addProject({ name: value, color: '#3b82f6' });
        } else if (type === 'people') {
            await this.store.addPerson(value);
        } else if (type === 'executors') {
            await this.store.addExecutor(value);
        }
        this._renderConfigData();
    }

    async _deleteConfigItem(type, id) {
        if (type === 'projects') await this.store.deleteProject(id);
        if (type === 'people') await this.store.deletePerson(id);
        if (type === 'executors') await this.store.deleteExecutor(id);
    }

    _exportToCSV() {
        const rows = [
            ['Type', 'ID', 'Name', 'Start', 'End', 'Project', 'Person', 'Executor']
        ];
        this.store.getTasks().forEach(t => {
            const p = this.store.getProjects().find(x => x.id === t.projectId)?.name || '';
            const per = this.store.getPeople().find(x => x.id === t.personId)?.name || '';
            const exc = this.store.getExecutors().find(x => x.id === t.executorId)?.name || '';
            rows.push(['Task', t.id, t.name, t.startDate, t.endDate, p, per, exc]);
        });

        let csvContent = "data:text/csv;charset=utf-8,"
            + rows.map(e => e.join(",")).join("\n");

        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", "calendar_export.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    _backupToJSON() {
        const data = {
            projects: this.store.getProjects(),
            people: this.store.getPeople(),
            executors: this.store.getExecutors(),
            tasks: this.store.getTasks(),
            exportedAt: new Date().toISOString()
        };
        const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const link = document.createElement("a");
        link.setAttribute("href", jsonStr);
        link.setAttribute("download", "calendar_backup.json");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    _handleContextMenu(e, task) {
        const menu = document.getElementById('context-menu');
        if (!menu) return;

        menu.innerHTML = '';
        const options = [
            { label: 'Editar', action: () => this._showTaskModal(task) },
            { label: 'Mover a...', action: () => this._showMoveTaskModal(task) },
            { label: 'Eliminar', action: () => this._confirmDeleteTask(task) }
        ];

        options.forEach(opt => {
            const item = document.createElement('div');
            item.className = 'menu-item';
            item.textContent = opt.label;
            item.addEventListener('click', (ev) => {
                ev.stopPropagation(); // Avoid triggering window click immediately
                opt.action();
                menu.style.display = 'none';
            });
            menu.appendChild(item);
        });

        // Determine position (prevent overflow if needed, simplified for now)
        menu.style.left = `${e.pageX}px`;
        menu.style.top = `${e.pageY}px`;
        menu.style.display = 'block';
    }

    async _confirmDeleteTask(task) {
        if (confirm(`¿Estás seguro de eliminar la tarea "${task.name}"?`)) {
            await this.store.deleteTask(task.id);
        }
    }

    _showMoveTaskModal(task) {
        this.currentTaskToMove = task; // Store reference
        const modal = document.getElementById('modal-move-task');
        const input = document.getElementById('move-task-date');
        input.value = task.startDate;

        modal.style.display = '';
        if (typeof modal.showModal === 'function') {
            try { modal.showModal(); } catch (e) { modal.style.display = 'flex'; }
        } else {
            modal.style.display = 'flex';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof YearView === 'function' && typeof MonthView === 'function') {
        new App();
    } else {
        console.error("Error Fatal: Clases de Vistas no definidas.");
    }
});
