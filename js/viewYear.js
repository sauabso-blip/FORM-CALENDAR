class YearView {
    constructor(store, state, onTaskUpdate, onContextMenu, onTaskClick) {
        this.store = store;
        this.state = state;
        this.onTaskUpdate = onTaskUpdate;
        this.onContextMenu = onContextMenu;
        this.onTaskClick = onTaskClick;
        this.container = document.createElement('div');
        this.container.className = 'year-view-container';

        // Tooltip management
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'app-tooltip';
        document.body.appendChild(this.tooltip);
        this.tooltip.style.display = 'none';
    }

    render(viewMode) {
        this.container.innerHTML = '';
        const currentYear = this.state.currentDate.getFullYear();

        let monthsToRender = [];
        if (viewMode === 'year') {
            for (let i = 0; i < 12; i++) {
                monthsToRender.push({ year: currentYear, monthIndex: i });
            }
        } else {
            const startMonth = this.state.currentDate.getMonth();
            for (let i = 0; i < 12; i++) {
                const d = new Date(currentYear, startMonth + i, 1);
                monthsToRender.push({ year: d.getFullYear(), monthIndex: d.getMonth() });
            }
        }

        const grid = this._createGrid(monthsToRender);
        this.container.appendChild(grid);

        return this.container;
    }

    _createGrid(months) {
        const gridContainer = document.createElement('div');
        gridContainer.className = 'year-grid';

        gridContainer.appendChild(this._createHeader());

        const tasks = this.store.getTasks();
        const categories = this.store.getCategories();

        const filteredTasks = tasks.filter(t => {
            return this.state.filters.categories.includes(t.categoryId);
        });

        months.forEach(mObj => {
            const row = this._createMonthRow(mObj.year, mObj.monthIndex, filteredTasks, categories);
            gridContainer.appendChild(row);
        });

        return gridContainer;
    }

    _createHeader() {
        const headerRow = document.createElement('div');
        headerRow.className = 'year-row header-row';
        headerRow.innerHTML = `
            <div class="year-row-label">Mes</div>
            <div class="year-days-container">
                ${Array.from({ length: 31 }, (_, i) => `<div class="year-day-header">${i + 1}</div>`).join('')}
            </div>
        `;
        return headerRow;
    }

    _createMonthRow(year, monthIndex, tasks, categories) {
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

        const row = document.createElement('div');
        row.className = 'year-row';

        row.innerHTML = `
            <div class="year-row-label">${monthNames[monthIndex]} '${String(year).slice(-2)}</div>
            <div class="year-days-container">
                ${Array.from({ length: 31 }, (_, i) => {
            const day = i + 1;
            let classes = 'year-day-cell';
            if (day > daysInMonth) classes += ' invalid-day';
            else {
                const d = new Date(year, monthIndex, day).getDay();
                if (d === 0 || d === 6) classes += ' weekend';
            }
            return `<div class="${classes}"></div>`;
        }).join('')}
            </div>
        `;

        const daysContainer = row.querySelector('.year-days-container');
        const monthTasks = this._layoutTasksForMonth(tasks, year, monthIndex);

        monthTasks.forEach(task => {
            const category = categories.find(c => c.id === task.categoryId);
            const bar = this._createTaskBar(task, year, monthIndex, category);
            daysContainer.appendChild(bar);
        });

        const totalHeight = Math.max(40, (this.maxLane + 1) * 28 + 8);
        row.style.height = `${totalHeight}px`;

        return row;
    }

    _layoutTasksForMonth(tasks, year, monthIndex) {
        const monthStart = new Date(year, monthIndex, 1);
        const monthEnd = new Date(year, monthIndex + 1, 0);

        const relevantTasks = tasks.filter(t => {
            const taskStart = new Date(t.startDate);
            const taskEnd = new Date(t.endDate);
            return taskStart <= monthEnd && taskEnd >= monthStart;
        });

        relevantTasks.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

        const lanes = [];
        this.maxLane = 0;

        relevantTasks.forEach(task => {
            let assignedLane = -1;
            for (let i = 0; i < lanes.length; i++) {
                const lastTaskInLane = lanes[i][lanes[i].length - 1];
                if (new Date(task.startDate) > new Date(lastTaskInLane.endDate)) {
                    lanes[i].push(task);
                    task.lane = i;
                    assignedLane = i;
                    break;
                }
            }

            if (assignedLane === -1) {
                task.lane = lanes.length;
                lanes.push([task]);
            }
            if (task.lane > this.maxLane) this.maxLane = task.lane;
        });

        return relevantTasks;
    }

    _createTaskBar(task, year, monthIndex, category) {
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
        const taskStart = new Date(task.startDate);
        const taskEnd = new Date(task.endDate);

        const startDay = (taskStart.getFullYear() === year && taskStart.getMonth() === monthIndex) ? taskStart.getDate() : 1;
        const endDay = (taskEnd.getFullYear() === year && taskEnd.getMonth() === monthIndex) ? taskEnd.getDate() : daysInMonth;

        const bar = document.createElement('div');
        bar.className = 'task-bar';

        let badges = '';
        if (task.ownerEmail && this.store.isSharedTask && this.store.isSharedTask(task)) {
            badges += ` [👥 ${task.ownerName || task.ownerEmail.split('@')[0]}]`;
        } else if (Array.isArray(task.sharedWith) && task.sharedWith.length > 0) {
            badges += ' 📤';
        }
        if (task.reminder && task.reminder !== 'none') badges += ' 🔔';
        if (task.amount && task.amount > 0) badges += ` 💶${Number(task.amount).toFixed(2)}€`;
        if (task.attachments && task.attachments.length > 0) badges += ` 📎${task.attachments.length}`;

        bar.textContent = `${task.name}${badges}`;
        const color = (category && category.color) ? category.color : '#3b82f6';
        bar.style.backgroundColor = color;

        const dayWidth = 100 / 31;
        bar.style.left = `${(startDay - 1) * dayWidth}%`;
        bar.style.width = `${(endDay - startDay + 1) * dayWidth}%`;
        bar.style.top = `${task.lane * 28 + 4}px`;

        // Mouse hover
        bar.addEventListener('mouseenter', (e) => this._showTooltip(e, task, category));
        bar.addEventListener('mouseleave', () => this._hideTooltip());

        // Touch handling (Mobile: tap = card, long-press = context menu)
        let touchTimer = null;
        let touchMoved = false;
        let touchStartX = 0;
        let touchStartY = 0;
        let wasTouch = false;

        bar.addEventListener('touchstart', (e) => {
            wasTouch = true;
            if (e.touches.length > 1) return;
            touchMoved = false;
            const t = e.touches[0];
            touchStartX = t.pageX;
            touchStartY = t.pageY;

            touchTimer = setTimeout(() => {
                touchTimer = null;
                this._hideTooltip();
                if (this.onContextMenu) {
                    this.onContextMenu({ pageX: touchStartX, pageY: touchStartY, preventDefault: () => {} }, task);
                }
            }, 500);
        }, { passive: true });

        bar.addEventListener('touchmove', (e) => {
            const t = e.touches[0];
            if (Math.abs(t.pageX - touchStartX) > 10 || Math.abs(t.pageY - touchStartY) > 10) {
                touchMoved = true;
                if (touchTimer) {
                    clearTimeout(touchTimer);
                    touchTimer = null;
                }
            }
        }, { passive: true });

        bar.addEventListener('touchend', (e) => {
            if (touchTimer) {
                clearTimeout(touchTimer);
                touchTimer = null;
                if (!touchMoved) {
                    e.preventDefault();
                    this._hideTooltip();
                    if (this.onTaskClick) {
                        this.onTaskClick(task);
                    }
                }
            }
        });

        bar.addEventListener('touchcancel', () => {
            if (touchTimer) {
                clearTimeout(touchTimer);
                touchTimer = null;
            }
        });

        // Mouse click (PC left-click -> Card)
        bar.addEventListener('click', (e) => {
            if (wasTouch) {
                wasTouch = false;
                return;
            }
            e.stopPropagation();
            this._hideTooltip();
            if (this.onTaskClick) {
                this.onTaskClick(task);
            }
        });

        // Mouse right-click (PC right-click -> Context menu)
        bar.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this._hideTooltip();
            if (this.onContextMenu) {
                this.onContextMenu(e, task);
            }
        });

        return bar;
    }

    _formatReminder(reminder) {
        const map = {
            'none': '',
            'on_time': 'A la hora del evento',
            '15m': '15 min antes',
            '1h': '1 hora antes',
            '1d': '1 día antes'
        };
        return map[reminder] || '';
    }

    _showTooltip(e, task, category) {
        const reminderLabel = this._formatReminder(task.reminder);
        const amountRow = (task.amount && task.amount > 0)
            ? `<div class="tooltip-row"><span class="tooltip-label">Importe:</span> <strong>${Number(task.amount).toFixed(2)} €</strong></div>`
            : '';
        const timeRow = task.time
            ? `<div class="tooltip-row"><span class="tooltip-label">Hora:</span> ${task.time}</div>`
            : '';
        const reminderRow = reminderLabel
            ? `<div class="tooltip-row"><span class="tooltip-label">Aviso:</span> 🔔 ${reminderLabel}</div>`
            : '';
        const locationRow = task.location
            ? `<div class="tooltip-row"><span class="tooltip-label">Lugar:</span> ${task.location}</div>`
            : '';
        const attachmentsRow = (task.attachments && task.attachments.length > 0)
            ? `<div class="tooltip-row"><span class="tooltip-label">Adjuntos:</span> 📎 ${task.attachments.length} archivo(s)</div>`
            : '';

        const ownerRow = (task.ownerEmail && this.store.isSharedTask && this.store.isSharedTask(task))
            ? `<div class="tooltip-row" style="color: #4f46e5; font-weight: 600;"><span class="tooltip-label">Agenda:</span> 👥 ${task.ownerName || task.ownerEmail}</div>`
            : (Array.isArray(task.sharedWith) && task.sharedWith.length > 0)
                ? `<div class="tooltip-row" style="color: #059669; font-weight: 600;"><span class="tooltip-label">Compartida con:</span> 📤 ${task.sharedWith.join(', ')}</div>`
                : '';

        this.tooltip.innerHTML = `
            <div class="tooltip-title">${task.name}</div>
            ${ownerRow}
            <div class="tooltip-row"><span class="tooltip-label">Categoría:</span> ${category ? category.name : 'N/A'}</div>
            ${amountRow}
            ${timeRow}
            ${reminderRow}
            ${locationRow}
            ${attachmentsRow}
            <hr>
            <div class="tooltip-row"><span class="tooltip-label">Inicio:</span> ${task.startDate}</div>
            <div class="tooltip-row"><span class="tooltip-label">Fin:</span> ${task.endDate}</div>
        `;
        this.tooltip.style.left = `${e.pageX + 10}px`;
        this.tooltip.style.top = `${e.pageY + 10}px`;
        this.tooltip.style.display = 'block';
    }

    _hideTooltip() {
        this.tooltip.style.display = 'none';
    }
}
window.YearView = YearView;
