class App {
    constructor() {
        this.state = {
            currentView: 'year',
            filters: { categories: [] },
            currentDate: new Date(),
        };
        this.store = store;
        this.currentAttachments = [];
        this.attachmentsToDelete = [];
        this.aiAssistant = (typeof AIAssistant === 'function') ? new AIAssistant(this.store, () => this.state) : null;

        this.monthView = new MonthView(
            this.store,
            this.state,
            this.handleTaskUpdate.bind(this),
            this._handleContextMenu.bind(this),
            this._showTaskCardModal.bind(this),
            this._updateExpenseSummary.bind(this)
        );
        this.weekView = (typeof WeekView === 'function') ? new WeekView(
            this.store,
            this.state,
            this.handleTaskUpdate.bind(this),
            this._handleContextMenu.bind(this),
            this._showTaskCardModal.bind(this),
            this._updateExpenseSummary.bind(this)
        ) : null;
        this.yearView = new YearView(
            this.store,
            this.state,
            this.handleTaskUpdate.bind(this),
            this._handleContextMenu.bind(this),
            this._showTaskCardModal.bind(this)
        );

        this._bindUIEvents();
        this._bindDataEvents();
        this._bindShareCalendarEvents();
        this._initConfigModal();

        this.initialized = false;
        this.knownCategoryIds = new Set();

        // Auto-initialize if auth already resolved or in local mode
        setTimeout(() => {
            if (!this.initialized) {
                if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
                    this.initAfterAuth(false);
                } else if (localStorage.getItem('agenda_local_mode') === 'true') {
                    this.initAfterAuth(true);
                }
            }
        }, 300);
    }

    initAfterAuth(forceLocal = false) {
        if (this.initialized && this.store.isLocal === forceLocal) return;
        this.store.initialize(() => {
            if (!this.initialized) {
                this._initializeFilters();
                this.initialized = true;
            } else {
                // Auto-enable any newly added categories in the filter
                this.store.getCategories().forEach(c => {
                    if (!this.knownCategoryIds.has(c.id)) {
                        this.knownCategoryIds.add(c.id);
                        if (!this.state.filters.categories.includes(c.id)) {
                            this.state.filters.categories.push(c.id);
                        }
                    }
                });
            }
            this.render();
        }, forceLocal);
    }

    _initializeFilters() {
        const cats = this.store.getCategories();
        this.state.filters.categories = cats.map(c => c.id);
        this.knownCategoryIds = new Set(this.state.filters.categories);
    }

    _bindUIEvents() {
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
        document.getElementById('btn-view-year')?.addEventListener('click', () => this.switchView('year'));
        document.getElementById('btn-view-rolling')?.addEventListener('click', () => this.switchView('rolling'));
        document.getElementById('btn-view-month')?.addEventListener('click', () => this.switchView('month'));
        document.getElementById('btn-view-week')?.addEventListener('click', () => this.switchView('week'));
        document.getElementById('btn-add-task')?.addEventListener('click', () => this._showTaskModal());
        document.getElementById('btn-add-category').addEventListener('click', () => this._openCategoryModal());

        const modalTask = document.getElementById('modal-task');
        const modalCategory = document.getElementById('modal-category');
        const modalTaskCard = document.getElementById('modal-task-card');

        const closeTaskModal = () => {
            if (typeof modalTask.close === 'function') {
                try { modalTask.close(); } catch (e) { }
            }
            modalTask.style.display = 'none';
        };

        const closeCategoryModal = () => {
            if (typeof modalCategory.close === 'function') {
                try { modalCategory.close(); } catch (e) { }
            }
            modalCategory.style.display = 'none';
        };

        const closeTaskCardModal = () => {
            if (modalTaskCard) {
                if (typeof modalTaskCard.close === 'function') {
                    try { modalTaskCard.close(); } catch (e) { }
                }
                modalTaskCard.style.display = 'none';
            }
        };

        document.getElementById('btn-cancel-task')?.addEventListener('click', closeTaskModal);
        document.getElementById('btn-cancel-category')?.addEventListener('click', closeCategoryModal);
        document.getElementById('btn-close-task-card')?.addEventListener('click', closeTaskCardModal);
        document.getElementById('btn-card-close')?.addEventListener('click', closeTaskCardModal);
        document.getElementById('btn-card-edit')?.addEventListener('click', () => {
            closeTaskCardModal();
            if (this.currentTaskInCard) {
                this._showTaskModal(this.currentTaskInCard);
            }
        });
        document.getElementById('btn-card-share')?.addEventListener('click', () => {
            closeTaskCardModal();
            if (this.currentTaskInCard) {
                this._promptShareSingleTask(this.currentTaskInCard);
            }
        });

        // Form Submit: Task
        document.getElementById('form-task')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('btn-submit-task');
            const statusDiv = document.getElementById('task-upload-status');
            const filesInput = document.getElementById('task-files');

            const idInput = document.getElementById('task-id');
            const desc = document.getElementById('task-desc').value.trim();
            const comments = document.getElementById('task-comments').value.trim();
            const location = document.getElementById('task-location').value.trim();
            const start = document.getElementById('task-start').value;
            const end = document.getElementById('task-end').value;
            const time = document.getElementById('task-time').value;
            const reminder = document.getElementById('task-reminder').value;
            const amountRaw = document.getElementById('task-amount').value;
            const categoryId = document.getElementById('task-category').value;
            const sharedWithRaw = document.getElementById('task-shared-with')?.value || '';
            const sharedWith = sharedWithRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

            const amount = amountRaw !== '' ? parseFloat(amountRaw) : null;

            try {
                if (submitBtn) submitBtn.disabled = true;

                // Upload new files if selected
                const uploadedAttachments = [...this.currentAttachments];
                const newFiles = filesInput && filesInput.files ? Array.from(filesInput.files) : [];

                if (newFiles.length > 0) {
                    if (statusDiv) {
                        statusDiv.style.display = 'block';
                        statusDiv.textContent = `Subiendo ${newFiles.length} archivo(s)...`;
                    }
                    for (let i = 0; i < newFiles.length; i++) {
                        if (statusDiv) {
                            statusDiv.textContent = `Subiendo (${i + 1}/${newFiles.length}): ${newFiles[i].name}...`;
                        }
                        const uploaded = await this.store.uploadAttachment(newFiles[i]);
                        uploadedAttachments.push(uploaded);
                    }
                }

                // Delete removed attachments from Storage
                for (const pathToDelete of this.attachmentsToDelete) {
                    await this.store.deleteAttachmentFile(pathToDelete);
                }

                const taskData = {
                    name: desc,
                    description: desc,
                    comments,
                    location,
                    startDate: start,
                    endDate: end,
                    time: time || '',
                    reminder: reminder || 'none',
                    amount: (amount !== null && !isNaN(amount)) ? amount : null,
                    categoryId,
                    attachments: uploadedAttachments,
                    sharedWith: sharedWith
                };

                if (idInput.value) {
                    await this.store.updateTask(idInput.value, taskData);
                } else {
                    await this.store.addTask(taskData);
                }

                e.target.reset();
                this.currentAttachments = [];
                this.attachmentsToDelete = [];
                if (statusDiv) statusDiv.style.display = 'none';
                closeTaskModal();
            } catch (err) {
                console.error("Error al guardar entrada:", err);
                alert("Error al guardar o subir adjuntos: " + (err.message || err));
                if (statusDiv) statusDiv.style.display = 'none';
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });

        // Form Submit: Category
        document.getElementById('form-category')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const idInput = document.getElementById('category-id');
            const name = document.getElementById('category-name').value.trim();
            const color = document.getElementById('category-color').value;

            const categoryData = { name, color };

            if (idInput.value) {
                await this.store.updateCategory(idInput.value, categoryData);
            } else {
                await this.store.addCategory(categoryData);
            }

            e.target.reset();
            closeCategoryModal();
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

        this._setupFilter('category');
    }

    _bindShareCalendarEvents() {
        const btnOpen = document.getElementById('btn-open-share-modal');
        const modal = document.getElementById('modal-share-calendar');
        const btnClose = document.getElementById('btn-close-share-modal');
        const btnDone = document.getElementById('btn-done-share-modal');
        const formShare = document.getElementById('form-share-calendar');
        const selectCal = document.getElementById('select-calendar-filter');

        const openModal = () => {
            if (modal) {
                modal.style.display = 'flex';
                this._renderShareLists();
            }
        };

        const closeModal = () => {
            if (modal) modal.style.display = 'none';
        };

        if (btnOpen) btnOpen.addEventListener('click', openModal);
        if (btnClose) btnClose.addEventListener('click', closeModal);
        if (btnDone) btnDone.addEventListener('click', closeModal);

        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });
        }

        if (selectCal) {
            selectCal.addEventListener('change', (e) => {
                const val = e.target.value;
                this.store.setActiveCalendarFilter(val);
                this.render();
            });
        }

        if (formShare) {
            formShare.addEventListener('submit', async (e) => {
                e.preventDefault();
                const emailInput = document.getElementById('share-target-email');
                const feedback = document.getElementById('share-feedback-msg');
                const btnSubmit = document.getElementById('btn-submit-share');
                const email = (emailInput?.value || '').trim().toLowerCase();

                if (!email) return;

                if (feedback) {
                    feedback.textContent = '';
                    feedback.style.display = 'none';
                }

                if (btnSubmit) {
                    btnSubmit.disabled = true;
                    btnSubmit.textContent = 'Compartiendo...';
                }

                try {
                    await this.store.shareCalendarWith(email);
                    if (feedback) {
                        feedback.textContent = `✅ Tu agenda ha sido compartida con "${email}".`;
                        feedback.style.color = '#16a34a';
                        feedback.style.display = 'block';
                    }
                    if (emailInput) emailInput.value = '';
                    this._renderShareLists();
                    this._updateCalendarSelector();
                } catch (err) {
                    console.error("Error al compartir calendario:", err);
                    if (feedback) {
                        feedback.textContent = `⚠️ ${err.message || err}`;
                        feedback.style.color = '#dc2626';
                        feedback.style.display = 'block';
                    }
                } finally {
                    if (btnSubmit) {
                        btnSubmit.disabled = false;
                        btnSubmit.textContent = 'Compartir';
                    }
                }
            });
        }
    }

    _renderShareLists() {
        const mySharesContainer = document.getElementById('my-shares-list');
        const sharedWithMeContainer = document.getElementById('shared-with-me-list');

        // 1. Con quién comparto mi agenda
        if (mySharesContainer) {
            const myShares = this.store.getMyShares();
            mySharesContainer.innerHTML = '';

            if (myShares.length === 0) {
                mySharesContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem; margin: 0;">No estás compartiendo tu agenda con nadie actualmente.</p>';
            } else {
                myShares.forEach(s => {
                    const card = document.createElement('div');
                    card.className = 'share-item-card';
                    const initial = (s.sharedWithName || s.sharedWithEmail || '?')[0].toUpperCase();

                    card.innerHTML = `
                        <div class="share-item-info">
                            <span class="share-user-badge">${initial}</span>
                            <div>
                                <strong>${s.sharedWithName || s.sharedWithEmail.split('@')[0]}</strong>
                                <div style="font-size: 0.78rem; color: var(--text-muted);">${s.sharedWithEmail}</div>
                            </div>
                        </div>
                        <button type="button" class="btn-revoke-share" data-id="${s.id}">Revocar acceso</button>
                    `;

                    const btnRevoke = card.querySelector('.btn-revoke-share');
                    if (btnRevoke) {
                        btnRevoke.addEventListener('click', async () => {
                            if (confirm(`¿Dejar de compartir tu agenda con ${s.sharedWithEmail}? Ya no podrá ver tus entradas.`)) {
                                await this.store.revokeCalendarShare(s.id);
                                this._renderShareLists();
                                this._updateCalendarSelector();
                            }
                        });
                    }

                    mySharesContainer.appendChild(card);
                });
            }
        }

        // 2. Agendas compartidas conmigo
        if (sharedWithMeContainer) {
            const sharedWithMe = this.store.getSharedWithMe();
            sharedWithMeContainer.innerHTML = '';

            if (sharedWithMe.length === 0) {
                sharedWithMeContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem; margin: 0;">Nadie ha compartido su agenda contigo aún.</p>';
            } else {
                sharedWithMe.forEach(s => {
                    const card = document.createElement('div');
                    card.className = 'share-item-card';
                    const initial = (s.ownerName || s.ownerEmail || '?')[0].toUpperCase();

                    card.innerHTML = `
                        <div class="share-item-info">
                            <span class="share-user-badge" style="background: #dcfce7; color: #15803d;">${initial}</span>
                            <div>
                                <strong>${s.ownerName || s.ownerEmail.split('@')[0]}</strong>
                                <div style="font-size: 0.78rem; color: var(--text-muted);">${s.ownerEmail}</div>
                            </div>
                        </div>
                        <button type="button" class="btn-view-shared-cal" data-email="${s.ownerEmail}">👁️ Ver Calendario</button>
                    `;

                    const btnView = card.querySelector('.btn-view-shared-cal');
                    if (btnView) {
                        btnView.addEventListener('click', () => {
                            this.store.setActiveCalendarFilter(s.ownerEmail);
                            const modal = document.getElementById('modal-share-calendar');
                            if (modal) modal.style.display = 'none';
                            this._updateCalendarSelector();
                            this.render();
                        });
                    }

                    sharedWithMeContainer.appendChild(card);
                });
            }
        }
    }

    _updateCalendarSelector() {
        const selectCal = document.getElementById('select-calendar-filter');
        if (!selectCal) return;

        const currentVal = this.store.getActiveCalendarFilter();
        const sharedWithMe = this.store.getSharedWithMe();

        let html = `<option value="mine" ${currentVal === 'mine' ? 'selected' : ''}>👤 Mi Agenda</option>`;

        sharedWithMe.forEach(s => {
            const ownerEmail = (s.ownerEmail || '').toLowerCase();
            const label = s.ownerName || ownerEmail.split('@')[0];
            const isSelected = currentVal.toLowerCase() === ownerEmail ? 'selected' : '';
            html += `<option value="${ownerEmail}" ${isSelected}>👥 Agenda de: ${label} (${ownerEmail})</option>`;
        });

        html += `<option value="all" ${currentVal === 'all' ? 'selected' : ''}>🌐 Ver Todos (Combinado)</option>`;

        selectCal.innerHTML = html;
        selectCal.value = currentVal;
    }

    switchView(view) {
        if (view === 'year' || view === 'rolling') {
            this.state.currentDate = new Date();
        }
        this.state.currentView = view;
        this.render();
    }

    render() {
        const mainContainer = document.getElementById('app-main');
        mainContainer.innerHTML = '';

        switch (this.state.currentView) {
            case 'week':
                if (this.weekView) mainContainer.appendChild(this.weekView.render());
                break;
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
        this._updateExpenseSummary();
        this._updateCalendarSelector();
    }

    _updateExpenseSummary() {
        const summaryBar = document.getElementById('expense-summary-bar');
        if (!summaryBar) return;

        const filteredTasks = this.store.getTasks().filter(t =>
            !t.categoryId || this.state.filters.categories.includes(t.categoryId)
        );

        const totalAllFiltered = filteredTasks.reduce((sum, t) => sum + (t.amount > 0 ? Number(t.amount) : 0), 0);
        const alertsCount = filteredTasks.filter(t => t.reminder && t.reminder !== 'none').length;

        let periodLabel = '';
        let periodTotal = 0;

        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

        if (this.state.currentView === 'week') {
            const weekDays = (window.AppUtils && window.AppUtils.getWeekDays)
                ? window.AppUtils.getWeekDays(this.state.currentDate)
                : [this.state.currentDate];
            const monday = weekDays[0];
            const sunday = weekDays[6] || monday;
            const startStr = (window.AppUtils && window.AppUtils.formatDateISO)
                ? window.AppUtils.formatDateISO(monday)
                : `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
            const endStr = (window.AppUtils && window.AppUtils.formatDateISO)
                ? window.AppUtils.formatDateISO(sunday)
                : `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`;

            const weekInfo = (window.AppUtils && window.AppUtils.getISOWeekNumber)
                ? window.AppUtils.getISOWeekNumber(weekDays[3] || monday)
                : { week: 1, year: monday.getFullYear() };

            periodLabel = `Gastos (Semana ${weekInfo.week} · ${weekInfo.year})`;
            periodTotal = filteredTasks
                .filter(t => t.amount > 0 && t.startDate <= endStr && t.endDate >= startStr)
                .reduce((sum, t) => sum + Number(t.amount), 0);
        } else if (this.state.currentView === 'month') {
            const year = this.state.currentDate.getFullYear();
            const month = this.state.currentDate.getMonth();
            const monthStartStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const monthEndStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

            periodLabel = `Gastos (${monthNames[month]} ${year})`;
            periodTotal = filteredTasks
                .filter(t => t.amount > 0 && t.startDate <= monthEndStr && t.endDate >= monthStartStr)
                .reduce((sum, t) => sum + Number(t.amount), 0);
        } else {
            const year = this.state.currentDate.getFullYear();
            let startRange, endRange;
            if (this.state.currentView === 'year') {
                startRange = `${year}-01-01`;
                endRange = `${year}-12-31`;
                periodLabel = `Gastos (${year})`;
            } else {
                const startMonth = this.state.currentDate.getMonth();
                const startD = new Date(year, startMonth, 1);
                const endD = new Date(year, startMonth + 12, 0);
                startRange = startD.toISOString().split('T')[0];
                endRange = endD.toISOString().split('T')[0];
                periodLabel = `Gastos (Año vista)`;
            }

            periodTotal = filteredTasks
                .filter(t => t.amount > 0 && t.startDate <= endRange && t.endDate >= startRange)
                .reduce((sum, t) => sum + Number(t.amount), 0);
        }

        summaryBar.innerHTML = `
            <div class="summary-item">
                <span class="summary-label">💶 ${periodLabel}:</span>
                <span class="summary-value">${periodTotal.toFixed(2)} €</span>
            </div>
            <div class="summary-divider"></div>
            <div class="summary-item">
                <span class="summary-label">Total acumulado (filtro):</span>
                <span class="summary-value">${totalAllFiltered.toFixed(2)} €</span>
            </div>
            <div class="summary-divider"></div>
            <div class="summary-item">
                <span class="summary-label">🔔 Avisos activos:</span>
                <span class="summary-value">${alertsCount}</span>
            </div>
        `;
    }

    updateFilterDropdowns() {
        this._updateFilterDropdown('category', this.store.getCategories());
    }

    _setupFilter(type) {
        const container = document.getElementById(`ms-list-${type}`);
        if (!container) return;

        container.addEventListener('change', (e) => {
            if (e.target.type !== 'checkbox') return;

            const allItems = this.store.getCategories();
            const allItemIds = allItems.map(item => item.id);

            if (e.target.classList.contains('ms-select-all')) {
                this.state.filters.categories = e.target.checked ? allItemIds : [];
            } else {
                const id = e.target.value;
                const set = new Set(this.state.filters.categories);
                if (e.target.checked) {
                    set.add(id);
                } else {
                    set.delete(id);
                }
                this.state.filters.categories = Array.from(set);
            }
            this.render();
        });
    }

    _updateFilterDropdown(type, items) {
        const container = document.getElementById(`ms-list-${type}`);
        if (!container) return;

        const allSelected = items.length > 0 && this.state.filters.categories.length === items.length;

        let optionsHTML = `<label class="ms-option ms-option-all"><input type="checkbox" class="ms-select-all" ${allSelected ? 'checked' : ''} />Seleccionar Todas</label>`;
        optionsHTML += items.map(item => `
            <label class="ms-option">
                <input type="checkbox" value="${item.id}" ${this.state.filters.categories.includes(item.id) ? 'checked' : ''} />
                <span class="legend-color" style="background:${item.color || '#3b82f6'}; display:inline-block;"></span>
                ${item.name}
            </label>
        `).join('');
        container.innerHTML = optionsHTML;
    }

    // --- MODALS & FORMS ---

    _showTaskModal(task = null) {
        const categorySelect = document.getElementById('task-category');

        if (categorySelect) {
            categorySelect.innerHTML = '';
            this.store.getCategories().forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.name;
                categorySelect.appendChild(opt);
            });
        }

        const modal = document.getElementById('modal-task');
        const form = document.getElementById('form-task');
        const title = form.querySelector('h2');
        const btnSubmit = document.getElementById('btn-submit-task');

        const idInput = document.getElementById('task-id');
        const descInput = document.getElementById('task-desc');
        const commentsInput = document.getElementById('task-comments');
        const locationInput = document.getElementById('task-location');
        const startInput = document.getElementById('task-start');
        const endInput = document.getElementById('task-end');
        const timeInput = document.getElementById('task-time');
        const reminderInput = document.getElementById('task-reminder');
        const amountInput = document.getElementById('task-amount');
        const filesInput = document.getElementById('task-files');
        const statusDiv = document.getElementById('task-upload-status');

        if (filesInput) filesInput.value = '';
        if (statusDiv) statusDiv.style.display = 'none';
        this.attachmentsToDelete = [];

        const sharedWithInput = document.getElementById('task-shared-with');

        if (task) {
            title.textContent = 'Editar Entrada';
            btnSubmit.textContent = 'Actualizar';
            idInput.value = task.id;
            descInput.value = task.name || '';
            commentsInput.value = task.comments || '';
            locationInput.value = task.location || '';
            startInput.value = task.startDate || '';
            endInput.value = task.endDate || '';
            timeInput.value = task.time || '';
            reminderInput.value = task.reminder || 'none';
            amountInput.value = (task.amount !== null && task.amount !== undefined) ? task.amount : '';
            if (sharedWithInput) {
                sharedWithInput.value = Array.isArray(task.sharedWith) ? task.sharedWith.join(', ') : '';
            }
            if (categorySelect) categorySelect.value = task.categoryId || '';
            this.currentAttachments = Array.isArray(task.attachments) ? [...task.attachments] : [];
        } else {
            title.textContent = 'Nueva Entrada';
            btnSubmit.textContent = 'Guardar';
            idInput.value = '';
            descInput.value = '';
            commentsInput.value = '';
            locationInput.value = '';
            const todayStr = new Date().toISOString().split('T')[0];
            startInput.value = todayStr;
            endInput.value = todayStr;
            timeInput.value = '';
            reminderInput.value = 'none';
            amountInput.value = '';
            if (sharedWithInput) {
                sharedWithInput.value = '';
            }
            this.currentAttachments = [];
        }

        this._renderAttachmentsList();

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

    _renderAttachmentsList() {
        const container = document.getElementById('task-attachments-list');
        if (!container) return;

        container.innerHTML = '';
        if (!this.currentAttachments || this.currentAttachments.length === 0) {
            return;
        }

        this.currentAttachments.forEach((att, index) => {
            const item = document.createElement('div');
            item.className = 'attachment-item';

            const info = document.createElement('div');
            info.className = 'attachment-info';

            const icon = this._getAttachmentIcon(att.type, att.name);
            const sizeKB = att.size ? ` (${Math.max(1, Math.round(att.size / 1024))} KB)` : '';

            const link = document.createElement('a');
            link.href = att.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.className = 'attachment-link';
            link.textContent = `${icon} ${att.name}${sizeKB}`;
            info.appendChild(link);

            if (att.type && att.type.startsWith('image/')) {
                const img = document.createElement('img');
                img.src = att.url;
                img.alt = att.name;
                img.className = 'attachment-preview-img';
                info.appendChild(img);
            } else if (att.type && att.type.startsWith('audio/')) {
                const audio = document.createElement('audio');
                audio.controls = true;
                audio.src = att.url;
                audio.className = 'attachment-audio';
                info.appendChild(audio);
            }

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'btn-icon attachment-remove';
            removeBtn.title = 'Eliminar adjunto';
            removeBtn.innerHTML = '&times;';
            removeBtn.onclick = () => {
                const removed = this.currentAttachments.splice(index, 1)[0];
                if (removed && removed.path) {
                    this.attachmentsToDelete.push(removed.path);
                }
                this._renderAttachmentsList();
            };

            item.appendChild(info);
            item.appendChild(removeBtn);
            container.appendChild(item);
        });
    }

    _getAttachmentIcon(mimeType = '', fileName = '') {
        const lower = fileName.toLowerCase();
        if (mimeType.startsWith('image/')) return '🖼️';
        if (mimeType.startsWith('audio/')) return '🎵';
        if (mimeType.includes('pdf') || lower.endsWith('.pdf')) return '📕';
        if (lower.endsWith('.doc') || lower.endsWith('.docx')) return '📘';
        if (lower.endsWith('.xls') || lower.endsWith('.xlsx')) return '📗';
        if (lower.endsWith('.txt')) return '📄';
        return '📎';
    }

    _openCategoryModal(category = null) {
        const modal = document.getElementById('modal-category');
        const form = document.getElementById('form-category');
        const title = form.querySelector('h2');
        const btnSubmit = form.querySelector('button[type="submit"]');

        const idInput = document.getElementById('category-id');
        const nameInput = document.getElementById('category-name');
        const colorInput = document.getElementById('category-color');

        if (category) {
            title.textContent = 'Editar Categoría';
            btnSubmit.textContent = 'Guardar Cambios';
            idInput.value = category.id;
            nameInput.value = category.name;
            colorInput.value = category.color;
        } else {
            title.textContent = 'Nueva Categoría';
            btnSubmit.textContent = 'Crear Categoría';
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

        const tabBtns = document.querySelectorAll('.config-tab-btn');
        const tabContents = document.querySelectorAll('.config-tab-content');

        if (btnOpen && modal) {
            btnOpen.addEventListener('click', () => {
                modal.style.display = 'flex';
                if (modalContent) {
                    modalContent.style.left = '50%';
                    modalContent.style.top = '50%';
                    modalContent.style.transform = 'translate(-50%, -50%)';
                }
                this._renderConfigData();
            });
        }

        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        }

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

        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        if (modalHeader) {
            modalHeader.addEventListener('mousedown', (e) => {
                if (e.target.closest('button')) return;
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

        document.getElementById('btn-export-csv')?.addEventListener('click', () => this._exportToCSV());
        document.getElementById('btn-backup-json')?.addEventListener('click', () => this._backupToJSON());
    }

    _renderConfigData() {
        this._renderConfigList({ type: 'categories', title: 'Categorías' }, this.store.getCategories());
    }

    _renderConfigList({ type, title }, items) {
        const container = document.getElementById(`config-list-${type}`);
        if (!container) return;

        container.innerHTML = '';

        const addItemRow = document.createElement('div');
        addItemRow.className = 'config-item-row add-row';
        addItemRow.innerHTML = `
            <input type="text" placeholder="Nueva ${title}..." id="new-${type}-input">
            <button class="btn btn-sm btn-primary">Añadir</button>
        `;
        const addBtn = addItemRow.querySelector('button');
        const addInput = addItemRow.querySelector('input');

        addBtn.addEventListener('click', () => {
            const val = addInput.value.trim();
            if (val) this._addConfigItem(type, val);
        });

        container.appendChild(addItemRow);

        items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'config-item-row';

            const colorInputInfo = `<input type="color" value="${item.color || '#3b82f6'}" class="edit-color">`;

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

            saveBtn.addEventListener('click', async () => {
                const newName = nameInput.value.trim();
                if (!newName) return;

                const updates = { name: newName };
                if (colorInput) updates.color = colorInput.value;

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
        if (type === 'categories') await this.store.updateCategory(id, data);
    }

    async _addConfigItem(type, value) {
        if (type === 'categories') {
            await this.store.addCategory({ name: value, color: '#3b82f6' });
        }
        this._renderConfigData();
    }

    async _deleteConfigItem(type, id) {
        if (type === 'categories') await this.store.deleteCategory(id);
    }

    _exportToCSV() {
        const rows = [
            ['ID', 'Titulo', 'Categoria', 'FechaInicio', 'FechaFin', 'Hora', 'Aviso', 'ImporteEUR', 'Lugar', 'Adjuntos']
        ];
        const escapeCSV = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

        this.store.getTasks().forEach(t => {
            const cat = this.store.getCategories().find(x => x.id === t.categoryId)?.name || '';
            const amt = (t.amount !== null && t.amount !== undefined) ? Number(t.amount).toFixed(2) : '';
            const attCount = Array.isArray(t.attachments) ? t.attachments.length : 0;
            rows.push([
                escapeCSV(t.id),
                escapeCSV(t.name),
                escapeCSV(cat),
                escapeCSV(t.startDate),
                escapeCSV(t.endDate),
                escapeCSV(t.time || ''),
                escapeCSV(t.reminder || 'none'),
                escapeCSV(amt),
                escapeCSV(t.location || ''),
                escapeCSV(attCount)
            ]);
        });

        const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", "agenda_personal_export.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    _backupToJSON() {
        const data = {
            categories: this.store.getCategories(),
            tasks: this.store.getTasks(),
            exportedAt: new Date().toISOString()
        };
        const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const link = document.createElement("a");
        link.setAttribute("href", jsonStr);
        link.setAttribute("download", "agenda_personal_backup.json");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    _showTaskCardModal(task) {
        if (!task) return;
        this.currentTaskInCard = task;

        const modal = document.getElementById('modal-task-card');
        if (!modal) return;
        const category = this.store.getCategories().find(c => c.id === task.categoryId);

        // Category Badge
        const catBadge = document.getElementById('card-task-category');
        if (catBadge) {
            catBadge.textContent = category ? category.name : 'General';
            catBadge.style.backgroundColor = (category && category.color) ? category.color : '#3b82f6';
        }

        // Title
        const titleEl = document.getElementById('card-task-title');
        if (titleEl) titleEl.textContent = task.name || 'Sin título';

        // Dates
        const datesEl = document.getElementById('card-task-dates');
        if (datesEl) {
            if (task.startDate === task.endDate) {
                datesEl.textContent = task.startDate;
            } else {
                datesEl.textContent = `${task.startDate}  ➜  ${task.endDate}`;
            }
        }

        // Time
        const timeRow = document.getElementById('card-task-time-row');
        const timeEl = document.getElementById('card-task-time');
        if (timeRow && timeEl) {
            if (task.time) {
                timeEl.textContent = task.time;
                timeRow.style.display = 'flex';
            } else {
                timeRow.style.display = 'none';
            }
        }

        // Reminder
        const reminderRow = document.getElementById('card-task-reminder-row');
        const reminderEl = document.getElementById('card-task-reminder');
        if (reminderRow && reminderEl) {
            const reminderMap = {
                'none': '',
                'on_time': 'A la hora del evento',
                '15m': '15 minutos antes',
                '1h': '1 hora antes',
                '1d': '1 día antes'
            };
            const remText = reminderMap[task.reminder] || '';
            if (remText) {
                reminderEl.textContent = remText;
                reminderRow.style.display = 'flex';
            } else {
                reminderRow.style.display = 'none';
            }
        }

        // Amount (Expense)
        const amountRow = document.getElementById('card-task-amount-row');
        const amountEl = document.getElementById('card-task-amount');
        if (amountRow && amountEl) {
            if (task.amount !== null && task.amount !== undefined && task.amount > 0) {
                amountEl.textContent = `${Number(task.amount).toFixed(2)} €`;
                amountRow.style.display = 'flex';
            } else {
                amountRow.style.display = 'none';
            }
        }

        // Location
        const locRow = document.getElementById('card-task-location-row');
        const locEl = document.getElementById('card-task-location');
        if (locRow && locEl) {
            if (task.location) {
                locEl.textContent = task.location;
                locRow.style.display = 'flex';
            } else {
                locRow.style.display = 'none';
            }
        }

        // Comments
        const commentsRow = document.getElementById('card-task-comments-row');
        const commentsEl = document.getElementById('card-task-comments');
        if (commentsRow && commentsEl) {
            if (task.comments && task.comments.trim()) {
                commentsEl.textContent = task.comments;
                commentsRow.style.display = 'flex';
            } else {
                commentsRow.style.display = 'none';
            }
        }

        // Attachments (Read-only list)
        const attRow = document.getElementById('card-task-attachments-row');
        const attList = document.getElementById('card-task-attachments');
        if (attRow && attList) {
            attList.innerHTML = '';
            if (Array.isArray(task.attachments) && task.attachments.length > 0) {
                attRow.style.display = 'flex';
                task.attachments.forEach(att => {
                    const item = document.createElement('div');
                    item.className = 'attachment-item';

                    const info = document.createElement('div');
                    info.className = 'attachment-info';

                    const icon = this._getAttachmentIcon(att.type, att.name);
                    const sizeKB = att.size ? ` (${Math.max(1, Math.round(att.size / 1024))} KB)` : '';

                    const link = document.createElement('a');
                    link.href = att.url;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.className = 'attachment-link';
                    link.textContent = `${icon} ${att.name}${sizeKB}`;
                    info.appendChild(link);

                    if (att.type && att.type.startsWith('image/')) {
                        const img = document.createElement('img');
                        img.src = att.url;
                        img.alt = att.name;
                        img.className = 'attachment-preview-img';
                        info.appendChild(img);
                    } else if (att.type && att.type.startsWith('audio/')) {
                        const audio = document.createElement('audio');
                        audio.controls = true;
                        audio.src = att.url;
                        audio.className = 'attachment-audio';
                        info.appendChild(audio);
                    }

                    item.appendChild(info);
                    attList.appendChild(item);
                });
            } else {
                attRow.style.display = 'none';
            }
        }

        // Shared Status row
        const sharedRow = document.getElementById('card-task-shared-row');
        const sharedBadge = document.getElementById('card-task-shared-badge');
        if (sharedRow && sharedBadge) {
            const currentUser = this.store.getCurrentUser();
            const myEmail = (currentUser.email || '').toLowerCase();
            const owner = (task.ownerEmail || myEmail).toLowerCase();
            const sharedWithList = Array.isArray(task.sharedWith) ? task.sharedWith : [];

            if (owner !== myEmail) {
                sharedBadge.innerHTML = `<span style="color: #4f46e5; font-weight: 600;">👥 Compartida contigo por: ${task.ownerName || task.ownerEmail}</span>`;
                sharedRow.style.display = 'flex';
            } else if (sharedWithList.length > 0) {
                sharedBadge.innerHTML = `<span style="color: #059669; font-weight: 600;">📤 Compartida con: ${sharedWithList.join(', ')}</span>`;
                sharedRow.style.display = 'flex';
            } else {
                sharedRow.style.display = 'none';
            }
        }

        modal.style.display = '';
        if (typeof modal.showModal === 'function') {
            try { modal.showModal(); } catch (e) { modal.style.display = 'flex'; }
        } else {
            modal.style.display = 'flex';
        }
    }

    _handleContextMenu(e, task) {
        const menu = document.getElementById('context-menu');
        if (!menu) return;

        menu.innerHTML = '';
        const options = [
            { label: '✏️ Editar entrada', action: () => this._showTaskModal(task) },
            { label: '👥 Compartir esta tarea...', action: () => this._promptShareSingleTask(task) },
            { label: '🔄 Mover a otra fecha...', action: () => this._showMoveTaskModal(task) },
            { label: '🗑️ Eliminar', action: () => this._confirmDeleteTask(task) }
        ];

        options.forEach(opt => {
            const item = document.createElement('div');
            item.className = 'menu-item';
            item.textContent = opt.label;
            item.addEventListener('click', (ev) => {
                ev.stopPropagation();
                opt.action();
                menu.style.display = 'none';
            });
            menu.appendChild(item);
        });

        // Ensure menu doesn't overflow mobile viewport
        const menuWidth = 200;
        const menuHeight = 140;
        const x = Math.max(10, Math.min(e.pageX, window.innerWidth - menuWidth - 15));
        const y = Math.max(10, Math.min(e.pageY, window.innerHeight - menuHeight - 15));

        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.style.display = 'block';
    }

    async _promptShareSingleTask(task) {
        if (!task) return;
        const currentShared = Array.isArray(task.sharedWith) ? task.sharedWith.join(', ') : '';
        const input = prompt(
            `👥 Compartir la tarea "${task.name}":\n\nIntroduce el correo del usuario con quien compartir esta tarea (puedes poner varios separados por comas).\nEl destinatario solo verá esta tarea específica en su calendario, sin ver el resto de tu agenda:`,
            currentShared
        );
        if (input === null) return; // Cancelado por usuario

        const sharedList = input.split(',')
            .map(e => e.trim().toLowerCase())
            .filter(Boolean);

        try {
            await this.store.updateTask(task.id, { sharedWith: sharedList });
            if (sharedList.length > 0) {
                alert(`✅ Tarea compartida con: ${sharedList.join(', ')}`);
            } else {
                alert(`ℹ️ Esta tarea ya no está compartida con ningún usuario.`);
            }
        } catch (err) {
            console.error("Error al compartir tarea:", err);
            alert("Hubo un error al guardar la compartición de la tarea: " + (err.message || err));
        }
    }

    async _confirmDeleteTask(task) {
        if (confirm(`¿Estás seguro de eliminar la entrada "${task.name}"?`)) {
            await this.store.deleteTask(task.id);
        }
    }

    _showMoveTaskModal(task) {
        this.currentTaskToMove = task;
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
        window._appInstance = new App();
    } else {
        console.error("Error Fatal: Clases de Vistas no definidas.");
    }
});
