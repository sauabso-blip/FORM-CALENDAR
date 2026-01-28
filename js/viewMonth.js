/**
 * Month View
 */
(function () {
    const store = window.AppStore;
    const utils = window.AppUtils;

    class MonthView {
        constructor(containerId) {
            this.container = document.getElementById(containerId);
            this.currentDate = new Date();
        }

        goToMonth(year, monthIndex) {
            this.currentDate = new Date(year, monthIndex, 1);
            this.render();
        }

        render() {
            this.container.innerHTML = '';
            this.container.className = 'month-view';

            const year = this.currentDate.getFullYear();
            const month = this.currentDate.getMonth(); // 0-11

            const monthNames = [
                'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
            ];

            // Header
            const header = document.createElement('div');
            header.style.padding = '1rem';
            header.style.display = 'flex';
            header.style.justifyContent = 'space-between';
            header.style.alignItems = 'center';
            header.style.borderBottom = '1px solid var(--border)';

            // Select Container (replaces h2)
            const controlsDiv = document.createElement('div');
            controlsDiv.style.display = 'flex';
            controlsDiv.style.gap = '0.5rem';
            controlsDiv.style.alignItems = 'center';

            // Month Select
            const mSelect = document.createElement('select');
            mSelect.className = 'header-select'; // we can style this
            monthNames.forEach((m, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                opt.textContent = m;
                if (idx === month) opt.selected = true;
                mSelect.appendChild(opt);
            });
            mSelect.onchange = (e) => this.goToMonth(year, parseInt(e.target.value));

            // Year Select
            const ySelect = document.createElement('select');
            ySelect.className = 'header-select';
            const currentY = new Date().getFullYear();
            for (let y = currentY - 5; y <= currentY + 5; y++) {
                const opt = document.createElement('option');
                opt.value = y;
                opt.textContent = y;
                if (y === year) opt.selected = true;
                ySelect.appendChild(opt);
            }
            ySelect.onchange = (e) => this.goToMonth(parseInt(e.target.value), month);

            // Styling for these specifics inputs to look like header
            mSelect.style.fontSize = '1.25rem';
            mSelect.style.fontWeight = '600';
            mSelect.style.padding = '0.25rem';
            mSelect.style.border = '1px solid transparent';
            mSelect.style.borderRadius = '0.25rem';
            mSelect.style.cursor = 'pointer';
            mSelect.style.backgroundColor = 'transparent';

            ySelect.style.fontSize = '1.25rem';
            ySelect.style.fontWeight = '600';
            ySelect.style.padding = '0.25rem';
            ySelect.style.border = '1px solid transparent';
            ySelect.style.borderRadius = '0.25rem';
            ySelect.style.cursor = 'pointer';
            ySelect.style.backgroundColor = 'transparent';

            // Hover effect for them
            const addHover = (el) => {
                el.onmouseover = () => el.style.backgroundColor = '#f3f4f6';
                el.onmouseout = () => el.style.backgroundColor = 'transparent';
            };
            addHover(mSelect);
            addHover(ySelect);

            controlsDiv.appendChild(mSelect);
            controlsDiv.appendChild(ySelect);

            // Navigation Buttons
            const navDiv = document.createElement('div');
            navDiv.innerHTML = `
                <button class="btn btn-secondary" id="month-prev"><</button>
                <button class="btn btn-secondary" id="month-next">></button>
            `;

            header.appendChild(controlsDiv);
            header.appendChild(navDiv);
            this.container.append(header);

            // Bind Navigation
            navDiv.querySelector('#month-prev').onclick = () => this.changeMonth(-1);
            navDiv.querySelector('#month-next').onclick = () => this.changeMonth(1);

            // Grid
            const grid = document.createElement('div');
            grid.className = 'month-grid';

            // Headers (Mon-Sun)
            const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
            dayNames.forEach(d => {
                const head = document.createElement('div');
                head.className = 'month-header-cell';
                head.textContent = d;
                grid.append(head);
            });

            // Days Calculation
            const firstDay = new Date(year, month, 1);
            let startingDay = firstDay.getDay(); // 0 (Sun) - 6 (Sat)
            if (startingDay === 0) startingDay = 6;
            else startingDay = startingDay - 1;

            const daysInMonth = utils.getDaysInMonth(year, month);
            const daysInPrevMonth = utils.getDaysInMonth(year, month - 1);

            for (let i = 0; i < startingDay; i++) {
                const cell = document.createElement('div');
                cell.className = 'month-cell other-month';
                cell.innerHTML = `<div class="month-cell-header">${daysInPrevMonth - (startingDay - 1) + i}</div>`;
                grid.append(cell);
            }

            const tasks = store.getTasks();
            const projects = store.getProjects();
            const filters = window.AppFilters || { projects: ['all'], people: ['all'] };

            // Current Month
            for (let d = 1; d <= daysInMonth; d++) {
                const cell = document.createElement('div');
                cell.className = 'month-cell';
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                cell.dataset.date = dateStr;

                cell.innerHTML = `<div class="month-cell-header" style="pointer-events:none;">${d}</div>`;

                // DRAG OVER / DROP (Target)
                cell.addEventListener('dragover', (e) => {
                    e.preventDefault(); // Necessary to allow dropping
                    e.dataTransfer.dropEffect = 'move';
                    cell.style.backgroundColor = 'var(--bg-secondary)';
                });

                cell.addEventListener('dragleave', (e) => {
                    cell.style.backgroundColor = '';
                });

                cell.addEventListener('drop', (e) => {
                    e.preventDefault();
                    cell.style.backgroundColor = '';
                    const taskId = e.dataTransfer.getData('text/plain');
                    if (taskId) {
                        const task = store.getTasks().find(t => t.id === taskId);
                        if (task) {
                            // Calculate new dates
                            const oldStart = new Date(task.start);
                            const oldEnd = new Date(task.end);
                            const durationMs = oldEnd.getTime() - oldStart.getTime();

                            const newStartStr = cell.dataset.date;
                            const newStart = new Date(newStartStr);
                            const newEnd = new Date(newStart.getTime() + durationMs);

                            const fmt = (d) => {
                                const y = d.getFullYear();
                                const m = String(d.getMonth() + 1).padStart(2, '0');
                                const day = String(d.getDate()).padStart(2, '0');
                                return `${y}-${m}-${day}`;
                            };

                            store.updateTask(taskId, {
                                start: fmt(newStart),
                                end: fmt(newEnd)
                            });
                        }
                    }
                });


                const dayTasks = tasks.filter(t => {
                    if (!filters.projects.includes('all') && !filters.projects.includes(t.projectId)) return false;
                    if (!filters.people.includes('all') && !filters.people.includes(t.assignee)) return false;
                    if (filters.executors && !filters.executors.includes('all') && !filters.executors.includes(t.executorId)) return false;

                    return (t.start <= dateStr && t.end >= dateStr);
                });

                dayTasks.forEach(t => {
                    const project = projects.find(p => p.id === t.projectId) || { name: '?', color: '#ccc' };
                    const person = store.getPerson(t.assignee) || { name: t.assignee || '?' };

                    const badge = document.createElement('div');
                    badge.className = 'month-task-item';
                    badge.style.backgroundColor = project.color;
                    badge.textContent = t.description;

                    // DRAGGABLE
                    badge.draggable = true;
                    badge.style.cursor = 'grab';
                    // Prevent text selection inside badge explicitly
                    badge.style.userSelect = 'none';

                    badge.addEventListener('dragstart', (e) => {
                        e.stopPropagation(); // Stop bubbling
                        e.dataTransfer.setData('text/plain', t.id);
                        e.dataTransfer.effectAllowed = 'move';
                        // Optional: Custom drag image if needed, but default is fine
                        badge.style.opacity = '0.5';
                    });

                    badge.addEventListener('dragend', () => {
                        badge.style.opacity = '1';
                        badge.style.cursor = 'grab';
                    });

                    // Allow dropping ON tasks (delegate to cell)
                    badge.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = 'move';
                        cell.style.backgroundColor = 'var(--bg-secondary)'; // Highlight parent cell
                    });

                    badge.addEventListener('dragleave', (e) => {
                        e.stopPropagation();
                        cell.style.backgroundColor = '';
                    });

                    badge.addEventListener('drop', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        cell.style.backgroundColor = '';

                        // Copy-paste logic from cell drop
                        const taskId = e.dataTransfer.getData('text/plain');
                        if (taskId) {
                            const task = store.getTasks().find(t => t.id === taskId);
                            if (task) {
                                const oldStart = new Date(task.start);
                                const oldEnd = new Date(task.end);
                                const durationMs = oldEnd.getTime() - oldStart.getTime();

                                const newStartStr = cell.dataset.date;
                                const newStart = new Date(newStartStr);
                                const newEnd = new Date(newStart.getTime() + durationMs);

                                const fmt = (d) => {
                                    const y = d.getFullYear();
                                    const m = String(d.getMonth() + 1).padStart(2, '0');
                                    const day = String(d.getDate()).padStart(2, '0');
                                    return `${y}-${m}-${day}`;
                                };

                                store.updateTask(taskId, {
                                    start: fmt(newStart),
                                    end: fmt(newEnd)
                                });
                            }
                        }
                    });

                    badge.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const event = new CustomEvent('app:task-contextmenu', {
                            detail: { taskId: t.id, x: e.pageX, y: e.pageY },
                            bubbles: true
                        });
                        this.container.dispatchEvent(event);
                    });

                    badge.addEventListener('dblclick', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Prevent drag start interfering with dblclick? Usually ok.
                        const event = new CustomEvent('app:task-edit', {
                            detail: { taskId: t.id },
                            bubbles: true
                        });
                        this.container.dispatchEvent(event);
                    });

                    badge.addEventListener('mouseenter', (e) => {
                        const event = new CustomEvent('app:tooltip-show', {
                            detail: {
                                title: t.description,
                                assignee: person.name,
                                start: utils.formatDateDisplay(t.start),
                                end: utils.formatDateDisplay(t.end),
                                project: project.name,
                                comments: t.comments,
                                location: t.location,
                                executorId: t.executorId,
                                x: e.clientX,
                                y: e.clientY
                            }
                        });
                        document.dispatchEvent(event);
                    });

                    badge.addEventListener('mouseleave', () => {
                        const event = new CustomEvent('app:tooltip-hide');
                        document.dispatchEvent(event);
                    });

                    cell.append(badge);
                });

                grid.append(cell);
            }

            this.container.append(grid);
        }

        changeMonth(delta) {
            this.currentDate.setMonth(this.currentDate.getMonth() + delta);
            this.render();
        }
    }

    // Expose Global
    window.MonthView = MonthView;
})();
