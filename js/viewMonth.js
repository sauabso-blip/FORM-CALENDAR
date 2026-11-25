class MonthView {
    constructor(store, state, onTaskUpdate, onContextMenu, onTaskClick, onMonthChange) {
        this.store = store;
        this.state = state;
        this.onTaskUpdate = onTaskUpdate;
        this.onContextMenu = onContextMenu;
        this.onTaskClick = onTaskClick;
        this.onMonthChange = onMonthChange;
        this.container = document.createElement('div');
        this.container.className = 'month-view';

        // Tooltip management
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'app-tooltip';
        document.body.appendChild(this.tooltip);
        this.tooltip.style.display = 'none';
    }

    render() {
        const year = this.state.currentDate.getFullYear();
        const month = this.state.currentDate.getMonth();
        this.container.innerHTML = '';

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '1rem';
        header.style.background = 'var(--bg-panel)';
        header.style.padding = '0.5rem 1rem';
        header.style.borderRadius = '0.5rem';
        header.style.border = '1px solid var(--border)';

        const notifyMonthChange = () => {
            this.render();
            if (this.onMonthChange) this.onMonthChange();
        };

        const btnPrev = document.createElement('button');
        btnPrev.className = 'btn btn-secondary';
        btnPrev.innerHTML = '&#8592; Anterior';
        btnPrev.onclick = () => {
            this.state.currentDate.setMonth(this.state.currentDate.getMonth() - 1);
            notifyMonthChange();
        };

        const datePicker = document.createElement('input');
        datePicker.type = 'month';
        datePicker.style.padding = '0.5rem';
        datePicker.style.border = '1px solid var(--border)';
        datePicker.style.borderRadius = '0.375rem';
        datePicker.style.fontFamily = 'inherit';
        datePicker.value = `${year}-${String(month + 1).padStart(2, '0')}`;
        datePicker.onchange = (e) => {
            if (e.target.value) {
                const [y, m] = e.target.value.split('-');
                this.state.currentDate.setFullYear(parseInt(y, 10), parseInt(m, 10) - 1, 1);
                notifyMonthChange();
            }
        };

        const btnToday = document.createElement('button');
        btnToday.className = 'btn btn-primary';
        btnToday.textContent = 'Mes Actual';
        btnToday.style.marginLeft = '10px';
        btnToday.onclick = () => {
            this.state.currentDate = new Date();
            notifyMonthChange();
        };

        const btnNext = document.createElement('button');
        btnNext.className = 'btn btn-secondary';
        btnNext.innerHTML = 'Siguiente &#8594;';
        btnNext.onclick = () => {
            this.state.currentDate.setMonth(this.state.currentDate.getMonth() + 1);
            notifyMonthChange();
        };

        const centerDiv = document.createElement('div');
        centerDiv.style.display = 'flex';
        centerDiv.style.alignItems = 'center';
        centerDiv.style.gap = '0.5rem';
        centerDiv.style.width = '100%';
        centerDiv.style.justifyContent = 'center';

        centerDiv.appendChild(btnPrev);
        centerDiv.appendChild(datePicker);
        centerDiv.appendChild(btnToday);
        centerDiv.appendChild(btnNext);

        header.appendChild(centerDiv);
        this.container.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'month-grid';

        // Cabecera de la columna de semana (a la izquierda)
        const weekHeaderCell = document.createElement('div');
        weekHeaderCell.className = 'month-header-cell month-week-header-cell';
        weekHeaderCell.innerHTML = '<span title="Semana del año (1-53)">Sem.</span>';
        grid.appendChild(weekHeaderCell);

        const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
        dayNames.forEach(name => {
            const headerCell = document.createElement('div');
            headerCell.className = 'month-header-cell';
            headerCell.textContent = name;
            grid.appendChild(headerCell);
        });

        const days = this._getCalendarDays(year, month);

        const tasks = this.store.getTasks();
        const filteredTasks = tasks.filter(t => {
            return this.state.filters.categories.includes(t.categoryId);
        });

        // Agrupar en filas de 7 días para anteponer el número de semana (1 a 53) en cada fila
        for (let i = 0; i < days.length; i += 7) {
            const weekDays = days.slice(i, i + 7);
            const thursday = weekDays[3] || weekDays[0];
            const dThursday = new Date(thursday.year, thursday.month, thursday.day);
            const weekInfo = (window.AppUtils && window.AppUtils.getISOWeekNumber)
                ? window.AppUtils.getISOWeekNumber(dThursday)
                : { week: 1, year: year };

            const weekCell = document.createElement('div');
            weekCell.className = 'month-week-number-cell';
            weekCell.innerHTML = `<span class="week-number-badge" title="Semana ${weekInfo.week} del año ${weekInfo.year}">S${weekInfo.week}</span>`;
            grid.appendChild(weekCell);

            weekDays.forEach(day => {
                const cell = this._createDayCell(day, month, filteredTasks);
                grid.appendChild(cell);
            });
        }

        this.container.appendChild(grid);
        return this.container;
    }

    _createDayCell(day, currentMonth, tasks) {
        const cell = document.createElement('div');
        cell.className = 'month-cell';
        if (day.month !== currentMonth) {
            cell.classList.add('other-month');
        }

        cell.innerHTML = `<div class="month-cell-header">${day.day}</div>`;

        // Handle month overflow/underflow cleanly when forming YYYY-MM-DD
        const cellDate = new Date(day.year, day.month, day.day);
        const dateString = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, '0')}-${String(cellDate.getDate()).padStart(2, '0')}`;

        const dayTasks = tasks.filter(t => dateString >= t.startDate && dateString <= t.endDate);

        dayTasks.forEach(task => {
            const taskElement = this._createTaskElement(task);
            cell.appendChild(taskElement);
        });

        this._addDragDropHandlers(cell, dateString);
        return cell;
    }

    _addDragDropHandlers(cell, dateString) {
        cell.addEventListener('dragover', (e) => {
            e.preventDefault();
            cell.style.backgroundColor = '#eef2ff';
        });

        cell.addEventListener('dragleave', () => {
            cell.style.backgroundColor = '';
        });

        cell.addEventListener('drop', (e) => {
            e.preventDefault();
            cell.style.backgroundColor = '';
            const taskId = e.dataTransfer.getData('text/plain');
            const task = this.store.getTasks().find(t => t.id === taskId);

            if (task) {
                const originalStart = new Date(task.startDate);
                const originalEnd = new Date(task.endDate);
                const duration = originalEnd.getTime() - originalStart.getTime();

                const newStartDate = new Date(dateString);
                const newEndDate = new Date(newStartDate.getTime() + duration);

                const formatDate = (d) => d.toISOString().split('T')[0];

                this.onTaskUpdate(taskId, {
                    startDate: formatDate(newStartDate),
                    endDate: formatDate(newEndDate)
                });
            }
        });
    }

    _createTaskElement(task) {
        const category = this.store.getCategories().find(c => c.id === task.categoryId);
        const taskElement = document.createElement('div');
        taskElement.className = 'month-task-item';

        let badges = '';
        if (task.ownerEmail && this.store.isSharedTask && this.store.isSharedTask(task)) {
            badges += ` [👥 ${task.ownerName || task.ownerEmail.split('@')[0]}]`;
        } else if (Array.isArray(task.sharedWith) && task.sharedWith.length > 0) {
            badges += ' 📤';
        }
        if (task.time) badges += ` ${task.time}`;
        if (task.reminder && task.reminder !== 'none') badges += ' 🔔';
        if (task.amount && task.amount > 0) badges += ` 💶${Number(task.amount).toFixed(2)}€`;
        if (task.attachments && task.attachments.length > 0) badges += ` 📎${task.attachments.length}`;

        taskElement.textContent = `${task.name}${badges}`;
        const color = (category && category.color) ? category.color : '#3b82f6';
        taskElement.style.backgroundColor = color;

        taskElement.draggable = true;
        taskElement.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', task.id);
            e.stopPropagation();
        });

        // Mouse hover
        taskElement.addEventListener('mouseenter', (e) => {
            this._showTooltip(e, task, category);
        });
        taskElement.addEventListener('mousemove', (e) => {
            this._positionTooltip(e);
        });
        taskElement.addEventListener('mouseleave', () => {
            this._hideTooltip();
        });

        // Touch handling (Mobile: tap = card, long-press = context menu)
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

        // Mouse click (PC left-click -> Card)
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

        // Mouse right-click (PC right-click -> Context menu)
        taskElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this._hideTooltip();
            if (this.onContextMenu) {
                this.onContextMenu(e, task);
            }
        });

        return taskElement;
    }

    _getCalendarDays(year, month) {
        const days = [];
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);

        const startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;

        const prevMonthEndDate = new Date(year, month, 0);
        for (let i = startDayOfWeek; i > 0; i--) {
            const day = prevMonthEndDate.getDate() - i + 1;
            days.push({ day, month: month - 1, year: year });
        }

        for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
            days.push({ day: i, month: month, year: year });
        }

        const gridsize = 42;
        let nextMonthDay = 1;
        while (days.length < gridsize) {
            days.push({ day: nextMonthDay++, month: month + 1, year: year });
        }

        return days;
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

        // Periodo
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

        // Notas (Mitad derecha completa)
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

        // Render first to measure dimensions without flicker
        this.tooltip.style.visibility = 'hidden';
        this.tooltip.style.display = 'block';

        const rect = this.tooltip.getBoundingClientRect();
        const tooltipW = rect.width || 580;
        const tooltipH = rect.height || 220;

        const pad = 12; // Margin from viewport edges
        const mouseOffset = 14;

        let left = clientX + mouseOffset;
        let top = clientY + mouseOffset;

        // Si se sale por la derecha, voltear a la izquierda del cursor
        if (left + tooltipW > window.innerWidth - pad) {
            left = clientX - tooltipW - mouseOffset;
        }

        // Si volteado a la izquierda se sale por el borde izquierdo, ajustar a margen seguro
        if (left < pad) {
            left = Math.max(pad, window.innerWidth - tooltipW - pad);
        }

        // Si se sale por abajo, voltear hacia arriba del cursor
        if (top + tooltipH > window.innerHeight - pad) {
            top = clientY - tooltipH - mouseOffset;
        }

        // Si volteado hacia arriba se sale por el borde superior, ajustar a margen seguro
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
window.MonthView = MonthView;
