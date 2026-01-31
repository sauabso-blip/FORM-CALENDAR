class MonthView {
    constructor(store, state, onTaskUpdate, onContextMenu) {
        this.store = store;
        this.state = state;
        this.onTaskUpdate = onTaskUpdate;
        this.onContextMenu = onContextMenu;
        this.container = document.createElement('div');
        this.container.className = 'month-view';

        // Tooltip management (similar to YearView)
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'app-tooltip';
        document.body.appendChild(this.tooltip);
        this.tooltip.style.display = 'none';
    }

    render() {
        const year = this.state.currentDate.getFullYear();
        const month = this.state.currentDate.getMonth();
        this.container.innerHTML = ''; // Clear previous content

        // You could add a header for month/year selection here if needed

        const grid = document.createElement('div');
        grid.className = 'month-grid';

        // 1. Add day headers (Lun, Mar, ...)
        const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
        dayNames.forEach(name => {
            const headerCell = document.createElement('div');
            headerCell.className = 'month-header-cell';
            headerCell.textContent = name;
            grid.appendChild(headerCell);
        });

        // 2. Get calendar days for the current month
        const days = this._getCalendarDays(year, month);

        // Filter tasks once
        const tasks = this.store.getTasks();
        const filteredTasks = tasks.filter(t => {
            const projectMatch = this.state.filters.projects.includes(t.projectId);
            const personMatch = this.state.filters.people.includes(t.personId);
            // Logic: If task has an executor, it must be selected. If no executor, show it (pass filter).
            const executorMatch = !t.executorId || this.state.filters.executors.includes(t.executorId);
            return projectMatch && personMatch && executorMatch;
        });

        // 3. Create a cell for each day
        days.forEach(day => {
            const cell = this._createDayCell(day, month, filteredTasks);
            grid.appendChild(cell);
        });

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

        const dateString = `${day.year}-${String(day.month + 1).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;

        // Find tasks for this day
        const dayTasks = tasks.filter(t => dateString >= t.startDate && dateString <= t.endDate);

        dayTasks.forEach(task => {
            const taskElement = this._createTaskElement(task);
            cell.appendChild(taskElement);
        });

        // Drag and Drop functionality
        this._addDragDropHandlers(cell, dateString);

        return cell;
    }

    _addDragDropHandlers(cell, dateString) {
        cell.addEventListener('dragover', (e) => {
            e.preventDefault();
            cell.style.backgroundColor = '#eef2ff'; // Highlight
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

                // Format to YYYY-MM-DD
                const formatDate = (d) => d.toISOString().split('T')[0];

                this.onTaskUpdate(taskId, {
                    startDate: formatDate(newStartDate),
                    endDate: formatDate(newEndDate)
                });
            }
        });
    }

    _createTaskElement(task) {
        const project = this.store.getProjects().find(p => p.id === task.projectId);
        const taskElement = document.createElement('div');
        taskElement.className = 'month-task-item';
        taskElement.textContent = task.name;
        const color = (project && project.color) ? project.color : '#cccccc';
        taskElement.style.backgroundColor = color;

        taskElement.draggable = true;
        taskElement.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', task.id);
            e.stopPropagation(); // Prevent parent drag handlers
        });

        // Add tooltip listeners
        taskElement.addEventListener('mouseenter', (e) => {
            this._showTooltip(e, task, project);
        });
        taskElement.addEventListener('mouseleave', () => {
            this._hideTooltip();
        });

        // Context Menu
        taskElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this._hideTooltip(); // Hide tooltip immediately
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

        // Adjust to start week on Monday
        const startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7; // 0=Monday, 6=Sunday

        // Days from previous month
        const prevMonthEndDate = new Date(year, month, 0);
        for (let i = startDayOfWeek; i > 0; i--) {
            const day = prevMonthEndDate.getDate() - i + 1;
            days.push({ day, month: month - 1, year: year });
        }

        // Days of current month
        for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
            days.push({ day: i, month: month, year: year });
        }

        // Days from next month to fill grid
        const gridsize = 42; // 6 weeks * 7 days
        const nextMonthStartDay = 1;
        let nextMonthDay = nextMonthStartDay;
        while (days.length < gridsize) {
            days.push({ day: nextMonthDay++, month: month + 1, year: year });
        }

        return days;
    }

    // Tooltip methods (copied from YearView for consistency)
    _showTooltip(e, task, project) {
        const person = this.store.getPeople().find(p => p.id === task.personId);
        const executor = this.store.getExecutors().find(ex => ex.id === task.executorId);

        this.tooltip.innerHTML = `
            <div class="tooltip-title">${task.name}</div>
            <div class="tooltip-row"><span class="tooltip-label">Proyecto:</span> ${project ? project.name : 'N/A'}</div>
            <div class="tooltip-row"><span class="tooltip-label">Responsable:</span> ${person ? person.name : 'N/A'}</div>
            <div class="tooltip-row"><span class="tooltip-label">Ejecutor:</span> ${executor ? executor.name : 'N/A'}</div>
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
window.MonthView = MonthView;