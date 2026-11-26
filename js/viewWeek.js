class WeekView {
    constructor(store, state, onTaskUpdate, onContextMenu, onTaskClick, onWeekChange) {
        this.store = store;
        this.state = state;
        this.onTaskUpdate = onTaskUpdate;
        this.onContextMenu = onContextMenu;
        this.onTaskClick = onTaskClick;
        this.onWeekChange = onWeekChange;

        this.container = document.createElement('div');
        this.container.className = 'week-view';

        // Tooltip management
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'app-tooltip';
        document.body.appendChild(this.tooltip);
        this.tooltip.style.display = 'none';
    }

    render() {
        const currentDate = this.state.currentDate;
        this.container.innerHTML = '';

        // Obtener los 7 días de la semana actual (Lunes a Domingo)
        const weekDays = (window.AppUtils && window.AppUtils.getWeekDays)
            ? window.AppUtils.getWeekDays(currentDate)
            : this._getWeekDaysFallback(currentDate);

        const monday = weekDays[0];
        const sunday = weekDays[6];

        const weekInfo = (window.AppUtils && window.AppUtils.getISOWeekNumber)
            ? window.AppUtils.getISOWeekNumber(weekDays[3] || monday)
            : { week: 1, year: currentDate.getFullYear() };

        // 1. Barra superior de navegación de la semana
        const header = document.createElement('div');
        header.className = 'week-nav-header';

        const notifyWeekChange = () => {
            this.render();
            if (this.onWeekChange) this.onWeekChange();
        };

        const btnPrev = document.createElement('button');
        btnPrev.className = 'btn btn-secondary';
        btnPrev.innerHTML = '&#8592; Anterior';
        btnPrev.title = 'Semana anterior';
        btnPrev.onclick = () => {
            this.state.currentDate.setDate(this.state.currentDate.getDate() - 7);
            notifyWeekChange();
        };

        const weekTitle = document.createElement('div');
        weekTitle.className = 'week-nav-title';
        const startStr = `${monday.getDate()}/${monday.getMonth() + 1}`;
        const endStr = `${sunday.getDate()}/${sunday.getMonth() + 1}/${sunday.getFullYear()}`;
        weekTitle.innerHTML = `<strong>Semana ${weekInfo.week}</strong> <span class="text-muted">(${startStr} - ${endStr})</span>`;

        const datePicker = document.createElement('input');
        datePicker.type = 'date';
        datePicker.className = 'week-date-picker';
        const yStr = currentDate.getFullYear();
        const mStr = String(currentDate.getMonth() + 1).padStart(2, '0');
        const dStr = String(currentDate.getDate()).padStart(2, '0');
        datePicker.value = `${yStr}-${mStr}-${dStr}`;
        datePicker.title = 'Saltar a fecha';
        datePicker.onchange = (e) => {
            if (e.target.value) {
                const [y, m, d] = e.target.value.split('-');
                this.state.currentDate = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
                notifyWeekChange();
            }
        };

        const btnToday = document.createElement('button');
        btnToday.className = 'btn btn-primary';
        btnToday.textContent = 'Semana Actual';
        btnToday.onclick = () => {
            this.state.currentDate = new Date();
            notifyWeekChange();
        };

        const btnNext = document.createElement('button');
        btnNext.className = 'btn btn-secondary';
        btnNext.innerHTML = 'Siguiente &#8594;';
        btnNext.title = 'Semana siguiente';
        btnNext.onclick = () => {
            this.state.currentDate.setDate(this.state.currentDate.getDate() + 7);
            notifyWeekChange();
        };

        const centerDiv = document.createElement('div');
        centerDiv.className = 'week-nav-center';
        centerDiv.appendChild(btnPrev);
        centerDiv.appendChild(weekTitle);
        centerDiv.appendChild(datePicker);
        centerDiv.appendChild(btnToday);
        centerDiv.appendChild(btnNext);

        header.appendChild(centerDiv);
        this.container.appendChild(header);

        // 2. Grilla de la semana (8 columnas: 1 para número de semana a la izquierda + 7 para los días)
        const grid = document.createElement('div');
        grid.className = 'week-grid';

        // Cabecera: Columna de semana
        const weekHeaderCell = document.createElement('div');
        weekHeaderCell.className = 'week-header-cell week-col-header';
        weekHeaderCell.innerHTML = '<span title="Número de semana (1-53)">Sem.</span>';
        grid.appendChild(weekHeaderCell);

        const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
        const today = new Date();
        const isToday = (d) => d.getDate() === today.getDate() &&
            d.getMonth() === today.getMonth() &&
            d.getFullYear() === today.getFullYear();

        // Cabecera de los 7 días
        weekDays.forEach((dayDate, idx) => {
            const dayHeaderCell = document.createElement('div');
            dayHeaderCell.className = 'week-header-cell';
            if (isToday(dayDate)) dayHeaderCell.classList.add('today-header');

            const dayNum = dayDate.getDate();
            const monthShort = dayDate.toLocaleDateString('es-ES', { month: 'short' });
            dayHeaderCell.innerHTML = `
                <div class="week-header-dayname">${dayNames[idx]}</div>
                <div class="week-header-daynum ${isToday(dayDate) ? 'today-badge' : ''}">${dayNum} ${monthShort}</div>
            `;
            grid.appendChild(dayHeaderCell);
        });

        // Tareas filtradas
        const tasks = this.store.getTasks();
        const filteredTasks = tasks.filter(t => {
            return !t.categoryId || this.state.filters.categories.includes(t.categoryId);
        });

        // 3. Fila de contenido:
        // Celda a la izquierda con el número de semana
        const weekNumberCell = document.createElement('div');
        weekNumberCell.className = 'week-number-side-cell';

        // Calcular totales de la semana para el resumen lateral
        const weekStartStr = this._formatISO(monday);
        const weekEndStr = this._formatISO(sunday);
        const weekTasks = filteredTasks.filter(t => t.startDate <= weekEndStr && t.endDate >= weekStartStr);
        const weekExpenses = weekTasks.reduce((sum, t) => sum + (t.amount > 0 ? Number(t.amount) : 0), 0);

        weekNumberCell.innerHTML = `
            <div class="week-badge-side" title="Semana ${weekInfo.week} del año ${weekInfo.year}">
                <span class="week-badge-prefix">Semana</span>
                <span class="week-badge-number">${weekInfo.week}</span>
            </div>
            <div class="week-side-info">
                <span class="week-side-tasks">📋 ${weekTasks.length} tareas</span>
                ${weekExpenses > 0 ? `<span class="week-side-money">💶 ${weekExpenses.toFixed(2)}€</span>` : ''}
            </div>
        `;
        grid.appendChild(weekNumberCell);

        // Las 7 columnas de días
        weekDays.forEach(dayDate => {
            const dateStr = this._formatISO(dayDate);
            const dayCell = document.createElement('div');
            dayCell.className = 'week-day-cell';
            if (isToday(dayDate)) dayCell.classList.add('today-cell');

            const dayTasks = filteredTasks.filter(t => dateStr >= t.startDate && dateStr <= t.endDate);

            // Título interior pequeño en móvil
            const mobileDayTitle = document.createElement('div');
            mobileDayTitle.className = 'week-day-mobile-title';
            mobileDayTitle.textContent = `${dayNames[(dayDate.getDay() + 6) % 7]} ${dayDate.getDate()}/${dayDate.getMonth() + 1}`;
            dayCell.appendChild(mobileDayTitle);

            const tasksListContainer = document.createElement('div');
            tasksListContainer.className = 'week-tasks-list';

            dayTasks.forEach(task => {
                const taskEl = this._createTaskElement(task);
                tasksListContainer.appendChild(taskEl);
            });

            dayCell.appendChild(tasksListContainer);

            // Drag and drop para mover eventos entre días
            this._addDragDropHandlers(dayCell, dateStr);

            grid.appendChild(dayCell);
        });

        this.container.appendChild(grid);
        return this.container;
    }

    _formatISO(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    _getWeekDaysFallback(currentDate) {
        const d = new Date(currentDate);
        const day = d.getDay();
        const diff = (day === 0 ? -6 : 1) - day;
        const monday = new Date(d);
        monday.setDate(d.getDate() + diff);

        const days = [];
        for (let i = 0; i < 7; i++) {
            const next = new Date(monday);
            next.setDate(monday.getDate() + i);
            days.push(next);
        }
        return days;
    }

    _createTaskElement(task) {
        const category = this.store.getCategories().find(c => c.id === task.categoryId);
        const taskElement = document.createElement('div');
        taskElement.className = 'week-task-item';

        let badges = '';
        if (task.ownerEmail && this.store.isSharedTask && this.store.isSharedTask(task)) {
            badges += ` [👥 ${task.ownerName || task.ownerEmail.split('@')[0]}]`;
        } else if (Array.isArray(task.sharedWith) && task.sharedWith.length > 0) {
            badges += ' 📤';
        }
        if (task.time) badges += ` ⏰${task.time}`;
        if (task.reminder && task.reminder !== 'none') badges += ' 🔔';
        if (task.amount && task.amount > 0) badges += ` 💶${Number(task.amount).toFixed(2)}€`;
        if (task.attachments && task.attachments.length > 0) badges += ` 📎${task.attachments.length}`;

        taskElement.innerHTML = `
            <div class="week-task-title">${this._escapeHTML(task.name)}</div>
            ${badges ? `<div class="week-task-badges">${badges}</div>` : ''}
            ${task.comments ? `<div class="week-task-notes-snippet">${this._escapeHTML(task.comments.slice(0, 40))}${task.comments.length > 40 ? '...' : ''}</div>` : ''}
        `;

        const color = (category && category.color) ? category.color : '#3b82f6';
        taskElement.style.borderLeftColor = color;

        // Drag & Drop
        taskElement.draggable = true;
        taskElement.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', task.id);
            e.stopPropagation();
        });

        // Hover Tooltip (Doble tamaño, 2 columnas con auto-flip)
        taskElement.addEventListener('mouseenter', (e) => {
            this._showTooltip(e, task, category);
        });
        taskElement.addEventListener('mousemove', (e) => {
            this._positionTooltip(e);
        });
        taskElement.addEventListener('mouseleave', () => {
            this._hideTooltip();
        });

        // Touch handling (Mobile tap -> Card, long-press -> Context menu)
        let touchTimer = null;
        let touchMoved = false;
        let touchStartX = 0;
        let touchStartY = 0;
        let wasTouch = false;

        taskElement.addEventListener('touchstart', (e) => {
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

        taskElement.addEventListener('touchmove', (e) => {
            const t = e.touches[0];
            if (Math.abs(t.pageX - touchStartX) > 10 || Math.abs(t.pageY - touchStartY) > 10) {
                touchMoved = true;
                if (touchTimer) {
                    clearTimeout(touchTimer);
                    touchTimer = null;
                }
            }
        }, { passive: true });

        taskElement.addEventListener('touchend', (e) => {
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

        taskElement.addEventListener('touchcancel', () => {
            if (touchTimer) {
                clearTimeout(touchTimer);
                touchTimer = null;
            }
        });

        // Mouse click (PC left-click -> Card modal)
        taskElement.addEventListener('click', (e) => {
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

        // Mouse right-click -> Context menu
        taskElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this._hideTooltip();
            if (this.onContextMenu) {
                this.onContextMenu(e, task);
            }
        });

        return taskElement;
    }

    _addDragDropHandlers(cell, targetDateStr) {
        cell.addEventListener('dragover', (e) => {
            e.preventDefault();
            cell.classList.add('drag-hover');
        });

        cell.addEventListener('dragleave', () => {
            cell.classList.remove('drag-hover');
        });

        cell.addEventListener('drop', (e) => {
            e.preventDefault();
            cell.classList.remove('drag-hover');
            const taskId = e.dataTransfer.getData('text/plain');
            const task = this.store.getTasks().find(t => t.id === taskId);

            if (task) {
                const originalStart = new Date(task.startDate + 'T00:00:00');
                const originalEnd = new Date(task.endDate + 'T00:00:00');
                const duration = originalEnd.getTime() - originalStart.getTime();

                const newStartDate = new Date(targetDateStr + 'T00:00:00');
                const newEndDate = new Date(newStartDate.getTime() + duration);

                const formatDate = (d) => {
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    return `${y}-${m}-${day}`;
                };

                this.onTaskUpdate(taskId, {
                    startDate: formatDate(newStartDate),
                    endDate: formatDate(newEndDate)
                });
            }
        });
    }

    _formatReminder(reminder) {
        const map = {
            'none': '',
            'on_time': 'A la hora del evento',
            '15m': '15 min antes',
            '1h': '1 hora antes',
            '1d': '1 día antes',
            'custom': 'Fecha/hora exacta'
        };
        return map[reminder] || '';
    }

    _escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    _showTooltip(e, task, category) {
        const reminderLabel = this._formatReminder(task.reminder);
        const categoryName = category ? category.name : 'General';
        const categoryColor = (category && category.color) ? category.color : '#3b82f6';

        let periodStr = task.startDate;
        if (task.endDate && task.endDate !== task.startDate) {
            periodStr = `${task.startDate} ➜ ${task.endDate}`;
        }
        const periodRow = `<div class="tooltip-row"><span class="tooltip-label">Periodo:</span> <span>${periodStr}</span></div>`;

        const timeRow = task.time
            ? `<div class="tooltip-row"><span class="tooltip-label">Hora:</span> <span>⏰ ${task.time}</span></div>`
            : '';
        const amountRow = (task.amount && task.amount > 0)
            ? `<div class="tooltip-row"><span class="tooltip-label">Importe:</span> <strong style="color: #34d399;">💶 ${Number(task.amount).toFixed(2)} €</strong></div>`
            : '';
        const reminderRow = reminderLabel
            ? `<div class="tooltip-row"><span class="tooltip-label">Aviso:</span> <span>🔔 ${reminderLabel}</span></div>`
            : '';
        const locationRow = task.location
            ? `<div class="tooltip-row"><span class="tooltip-label">Lugar:</span> <span>📍 ${this._escapeHTML(task.location)}</span></div>`
            : '';
        const attachmentsRow = (task.attachments && task.attachments.length > 0)
            ? `<div class="tooltip-row"><span class="tooltip-label">Adjuntos:</span> <span>📎 ${task.attachments.length} archivo(s)</span></div>`
            : '';

        const ownerRow = (task.ownerEmail && this.store.isSharedTask && this.store.isSharedTask(task))
            ? `<div class="tooltip-row" style="color: #818cf8; font-weight: 600;"><span class="tooltip-label">Agenda:</span> <span>👥 ${this._escapeHTML(task.ownerName || task.ownerEmail)}</span></div>`
            : (Array.isArray(task.sharedWith) && task.sharedWith.length > 0)
                ? `<div class="tooltip-row" style="color: #34d399; font-weight: 600;"><span class="tooltip-label">Compartida:</span> <span>📤 con ${this._escapeHTML(task.sharedWith.join(', '))}</span></div>`
                : '';

        const hasNotes = task.comments && task.comments.trim().length > 0;
        const notesHTML = hasNotes
            ? `<div class="tooltip-notes-body">${this._escapeHTML(task.comments.trim())}</div>`
            : `<div class="tooltip-notes-body tooltip-notes-empty">Sin notas adicionales</div>`;

        this.tooltip.innerHTML = `
            <div class="tooltip-container">
                <div class="tooltip-col-main">
                    <div class="tooltip-title">${this._escapeHTML(task.name)}</div>
                    ${ownerRow}
                    <div class="tooltip-row">
                        <span class="tooltip-label">Categoría:</span>
                        <span class="tooltip-cat-badge" style="background:${categoryColor}">${this._escapeHTML(categoryName)}</span>
                    </div>
                    ${periodRow}
                    ${timeRow}
                    ${amountRow}
                    ${reminderRow}
                    ${locationRow}
                    ${attachmentsRow}
                </div>
                <div class="tooltip-col-notes">
                    <div class="tooltip-notes-header">📝 Notas y detalles:</div>
                    ${notesHTML}
                </div>
            </div>
        `;

        this._positionTooltip(e);
    }

    _positionTooltip(e) {
        if (!this.tooltip) return;

        let clientX = e.clientX;
        let clientY = e.clientY;

        if (clientX === undefined) {
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else if (e.pageX !== undefined) {
                clientX = e.pageX - window.scrollX;
                clientY = e.pageY - window.scrollY;
            } else {
                clientX = window.innerWidth / 2;
                clientY = window.innerHeight / 2;
            }
        }

        this.tooltip.style.visibility = 'hidden';
        this.tooltip.style.display = 'block';

        const rect = this.tooltip.getBoundingClientRect();
        const tooltipW = rect.width || 580;
        const tooltipH = rect.height || 220;

        const pad = 12;
        const mouseOffset = 14;

        let left = clientX + mouseOffset;
        let top = clientY + mouseOffset;

        // Si se sale por la derecha, voltear a la izquierda
        if (left + tooltipW > window.innerWidth - pad) {
            left = clientX - tooltipW - mouseOffset;
        }

        // Si se sale por la izquierda
        if (left < pad) {
            left = Math.max(pad, window.innerWidth - tooltipW - pad);
        }

        // Si se sale por abajo, voltear hacia arriba
        if (top + tooltipH > window.innerHeight - pad) {
            top = clientY - tooltipH - mouseOffset;
        }

        // Si se sale por arriba
        if (top < pad) {
            top = Math.max(pad, window.innerHeight - tooltipH - pad);
        }

        this.tooltip.style.left = `${Math.round(left)}px`;
        this.tooltip.style.top = `${Math.round(top)}px`;
        this.tooltip.style.visibility = 'visible';
    }

    _hideTooltip() {
        if (this.tooltip) {
            this.tooltip.style.display = 'none';
        }
    }
}
window.WeekView = WeekView;
