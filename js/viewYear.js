class YearView {
    constructor(store, state, onTaskUpdate, onContextMenu) {
        this.store = store;
        this.state = state;
        this.onTaskUpdate = onTaskUpdate;
        this.onContextMenu = onContextMenu;
        this.container = document.createElement('div');
        this.container.className = 'year-view-container';

        // Tooltip management
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'app-tooltip';
        document.body.appendChild(this.tooltip);
        this.tooltip.style.display = 'none';
    }

    render(viewMode) {
        this.container.innerHTML = ''; // Clear previous content
        const currentYear = this.state.currentDate.getFullYear();

        // Determine months to render based on view mode
        let monthsToRender = [];
        if (viewMode === 'year') {
            for (let i = 0; i < 12; i++) {
                monthsToRender.push({ year: currentYear, monthIndex: i });
            }
        } else { // rolling view
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
        const projects = this.store.getProjects();

        // Filter tasks based on global filters in this.state.filters
        const filteredTasks = tasks.filter(t => {
            const projectMatch = this.state.filters.projects.includes(t.projectId);
            const personMatch = this.state.filters.people.includes(t.personId);

            // For optional executor, if task has no executor, should it be shown?
            // Current strict logic: show only if executor is in the list.
            // If "All" is selected, and task has NO executor, it hides.
            // Adaptation: If task has no executor, treat as 'neutral' OR require user to have "(Unassigned)" option?
            // For now, strict filtering as per checklist. If ID is not in selected list, hide it. 
            // Note: If task.executorId is empty, it won't be in the list of IDs (which are real IDs).

            // Allow unassigned executor if we assume filters only apply to assigned ones? 
            // Better behavior: If filter has items, strict match.
            const executorMatch = !t.executorId || this.state.filters.executors.includes(t.executorId);
            // Wait, if I uncheck "Executor A", I don't want to see Executor A.
            // If I uncheck ALL executors, I see nothing with executors.
            // What about tasks with NO executor?
            // If I interpret "Filter Executors" as "Show tasks handled by these people", unassigned shouldn't show?
            // BUT usually unassigned tasks are important.
            // Let's stick to: "If task has an executor, it MUST be in the list. If it has NO executor, allow it."

            return projectMatch && personMatch && executorMatch;
        });

        months.forEach(mObj => {
            const row = this._createMonthRow(mObj.year, mObj.monthIndex, filteredTasks, projects);
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

    _createMonthRow(year, monthIndex, tasks, projects) {
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
            const project = projects.find(p => p.id === task.projectId);
            const bar = this._createTaskBar(task, year, monthIndex, project);
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

        const lanes = []; // This will be an array of arrays, each sub-array is a lane
        this.maxLane = 0;

        relevantTasks.forEach(task => {
            let assignedLane = -1;
            // Find a lane where the task fits
            for (let i = 0; i < lanes.length; i++) {
                const lastTaskInLane = lanes[i][lanes[i].length - 1];
                if (new Date(task.startDate) > new Date(lastTaskInLane.endDate)) {
                    lanes[i].push(task);
                    task.lane = i;
                    assignedLane = i;
                    break;
                }
            }

            // If no lane was found, create a new one
            if (assignedLane === -1) {
                task.lane = lanes.length;
                lanes.push([task]);
            }
            if (task.lane > this.maxLane) this.maxLane = task.lane;
        });

        return relevantTasks;
    }

    _createTaskBar(task, year, monthIndex, project) {
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
        const taskStart = new Date(task.startDate);
        const taskEnd = new Date(task.endDate);

        const startDay = taskStart.getMonth() === monthIndex ? taskStart.getDate() : 1;
        const endDay = taskEnd.getMonth() === monthIndex ? taskEnd.getDate() : daysInMonth;

        const bar = document.createElement('div');
        bar.className = 'task-bar';
        bar.textContent = task.name;
        const color = (project && project.color) ? project.color : '#cccccc';
        bar.style.backgroundColor = color;

        const dayWidth = 100 / 31;
        bar.style.left = `${(startDay - 1) * dayWidth}%`;
        bar.style.width = `${(endDay - startDay + 1) * dayWidth}%`;
        bar.style.top = `${task.lane * 28 + 4}px`; // 28px per lane height

        // Show tooltip on hover
        bar.addEventListener('mouseenter', (e) => this._showTooltip(e, task, project));
        bar.addEventListener('mouseleave', () => this._hideTooltip());

        // Context Menu
        bar.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this._hideTooltip(); // Hide tooltip immediately
            if (this.onContextMenu) {
                this.onContextMenu(e, task);
            }
        });

        return bar;
    }

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
window.YearView = YearView;