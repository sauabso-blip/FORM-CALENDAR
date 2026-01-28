/**
 * Year View
 */
(function () {
    const store = window.AppStore;
    const utils = window.AppUtils;

    class YearView {
        constructor(containerId) {
            this.container = document.getElementById(containerId);
            this.currentYear = new Date().getFullYear();
            this.viewMode = 'calendar'; // 'calendar' | 'rolling'
            this.rollingStartMonth = new Date().getMonth(); // 0-11
        }

        setMode(mode) {
            this.viewMode = mode;
            if (mode === 'rolling') {
                const now = new Date();
                this.currentYear = now.getFullYear();
                this.rollingStartMonth = now.getMonth();
            }
            this.render();
        }

        render() {
            this.container.innerHTML = '';
            this.container.className = 'year-view';

            // Calculate range
            let titleText = '';
            let monthsToRender = [];

            if (this.viewMode === 'calendar') {
                titleText = `${this.currentYear}`;
                for (let i = 0; i < 12; i++) {
                    monthsToRender.push({ year: this.currentYear, monthIndex: i });
                }
            } else {
                let endYr = this.currentYear;
                if (this.rollingStartMonth > 0) endYr++;

                const monthNames = [
                    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
                ];

                const startMName = monthNames[this.rollingStartMonth];
                const endMName = monthNames[(this.rollingStartMonth + 11) % 12];

                if (this.currentYear === endYr) {
                    titleText = `${startMName} - ${endMName} ${this.currentYear}`;
                } else {
                    titleText = `${startMName} ${this.currentYear} - ${endMName} ${endYr}`;
                }

                for (let i = 0; i < 12; i++) {
                    let m = (this.rollingStartMonth + i) % 12;
                    let y = this.currentYear + Math.floor((this.rollingStartMonth + i) / 12);
                    monthsToRender.push({ year: y, monthIndex: m });
                }
            }

            // HEADER
            const header = document.createElement('div');
            header.style.padding = '0.5rem 1rem';
            header.style.display = 'flex';
            header.style.gap = '1rem';
            header.style.borderBottom = '1px solid var(--border)';
            header.style.alignItems = 'center';

            // Header Content
            const navDiv = document.createElement('div');
            navDiv.style.display = 'flex';
            navDiv.style.alignItems = 'center';
            navDiv.style.gap = '1rem';
            navDiv.innerHTML = `
                <h2>${titleText}</h2>
                <div>
                    <button class="btn btn-secondary" id="year-prev"><</button>
                    <button class="btn btn-secondary" id="year-next">></button>
                </div>
            `;
            header.appendChild(navDiv);

            // LEGEND
            const legendDiv = document.createElement('div');
            legendDiv.className = 'year-legend';
            store.getProjects().forEach(p => {
                const item = document.createElement('div');
                item.className = 'legend-item';
                item.innerHTML = `
                    <div class="legend-color" style="background-color: ${p.color}"></div>
                    <span>${p.name}</span>
                `;
                legendDiv.appendChild(item);
            });
            header.appendChild(legendDiv);

            this.container.append(header);

            // Bind events
            const btnPrev = header.querySelector('#year-prev');
            const btnNext = header.querySelector('#year-next');

            if (btnPrev) btnPrev.onclick = () => this.changeYear(-1);
            if (btnNext) btnNext.onclick = () => this.changeYear(1);

            const scrollContainer = document.createElement('div');
            scrollContainer.className = 'year-view-container';

            // GRID HEADER
            const gridHeader = document.createElement('div');
            gridHeader.className = 'year-row header-row';

            const labelPlaceholder = document.createElement('div');
            labelPlaceholder.className = 'year-row-label';
            labelPlaceholder.textContent = 'Mes';
            gridHeader.append(labelPlaceholder);

            const daysHeaderContainer = document.createElement('div');
            daysHeaderContainer.className = 'year-days-container';

            for (let i = 1; i <= 31; i++) {
                const dayHead = document.createElement('div');
                dayHead.className = 'year-day-header';
                dayHead.textContent = i;
                daysHeaderContainer.append(dayHead);
            }
            gridHeader.append(daysHeaderContainer);
            scrollContainer.append(gridHeader);

            const monthNamesBase = [
                'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
            ];

            const tasks = store.getTasks();
            const projects = store.getProjects();

            // FILTERS (Global Multi-select)
            const filters = window.AppFilters || { projects: ['all'], people: ['all'] };

            const TASK_HEIGHT = 24;
            const TASK_GAP = 4;
            const ROW_PADDING = 8;

            monthsToRender.forEach((mObj) => {
                const mIndex = mObj.monthIndex;
                const mYear = mObj.year;
                const mName = monthNamesBase[mIndex];

                let labelText = mName;
                if (this.viewMode === 'rolling') {
                    labelText += ` '${String(mYear).slice(-2)}`;
                }

                const row = document.createElement('div');
                row.className = 'year-row';

                const label = document.createElement('div');
                label.className = 'year-row-label';
                label.textContent = labelText;
                row.append(label);

                const daysContainer = document.createElement('div');
                daysContainer.className = 'year-days-container';
                daysContainer.style.position = 'relative';

                const daysInThisMonth = utils.getDaysInMonth(mYear, mIndex);

                for (let d = 1; d <= 31; d++) {
                    const dayDiv = document.createElement('div');
                    dayDiv.className = 'year-day-cell';

                    if (d <= daysInThisMonth) {
                        const dateObj = new Date(mYear, mIndex, d);
                        const dayOfWeek = dateObj.getDay();
                        if (dayOfWeek === 0 || dayOfWeek === 6) {
                            dayDiv.classList.add('weekend');
                        }
                        dayDiv.title = `${d} ${mName} ${mYear}`;
                    } else {
                        dayDiv.classList.add('invalid-day');
                    }
                    daysContainer.append(dayDiv);
                }

                // Filtering Logic
                const monthStartStr = `${mYear}-${String(mIndex + 1).padStart(2, '0')}-01`;
                const monthEndStr = `${mYear}-${String(mIndex + 1).padStart(2, '0')}-${daysInThisMonth}`;

                let tasksInMonth = tasks.filter(t => {
                    // Check Project Filter
                    if (!filters.projects.includes('all') && !filters.projects.includes(t.projectId)) return false;
                    // Check Person Filter
                    if (!filters.people.includes('all') && !filters.people.includes(t.assignee)) return false;
                    // Check Executor Filter
                    if (filters.executors && !filters.executors.includes('all') && !filters.executors.includes(t.executorId)) return false;

                    if (t.end < monthStartStr) return false;
                    if (t.start > monthEndStr) return false;
                    return true;
                });

                // ...

                // Correcting the mapping
                const mappedTasks = tasksInMonth.map(t => {
                    let startDay = 1;
                    if (t.start >= monthStartStr) {
                        startDay = parseInt(t.start.split('-')[2]);
                    }
                    let endDay = daysInThisMonth;
                    if (t.end <= monthEndStr) {
                        endDay = parseInt(t.end.split('-')[2]);
                    }
                    return { ...t, startIdx: startDay, endIdx: endDay };
                });

                mappedTasks.sort((a, b) => {
                    if (a.startIdx !== b.startIdx) return a.startIdx - b.startIdx;
                    return (b.endIdx - b.startIdx) - (a.endIdx - a.startIdx);
                });

                const lanes = [];

                mappedTasks.forEach(task => {
                    let assignedLane = -1;
                    for (let l = 0; l < lanes.length; l++) {
                        const collision = lanes[l].some(existing => {
                            return (task.startIdx <= existing.endIdx && task.endIdx >= existing.startIdx);
                        });

                        if (!collision) {
                            assignedLane = l;
                            lanes[l].push(task);
                            break;
                        }
                    }

                    if (assignedLane === -1) {
                        lanes.push([task]);
                        assignedLane = lanes.length - 1;
                    }

                    task.visualLane = assignedLane;
                });

                const totalLanes = lanes.length;
                const totalHeight = Math.max(40, (totalLanes * (TASK_HEIGHT + TASK_GAP)) + (ROW_PADDING * 2));

                row.style.height = `${totalHeight}px`;

                mappedTasks.forEach(t => {
                    const project = projects.find(p => p.id === t.projectId) || { name: 'Desconocido', color: '#ccc' };
                    const person = store.getPerson(t.assignee) || { name: t.assignee || '?' };

                    const dayUnit = 100 / 31;
                    const length = (t.endIdx - t.startIdx) + 1;
                    const widthPercent = length * dayUnit;
                    const leftPercent = (t.startIdx - 1) * dayUnit;
                    const topPos = ROW_PADDING + (t.visualLane * (TASK_HEIGHT + TASK_GAP));

                    const bar = document.createElement('div');
                    bar.className = 'task-bar';
                    bar.style.left = leftPercent + '%';
                    bar.style.width = widthPercent + '%';
                    bar.style.backgroundColor = project.color;

                    bar.style.top = `${topPos}px`;

                    bar.textContent = t.description;

                    // Context Menu
                    bar.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const event = new CustomEvent('app:task-contextmenu', {
                            detail: { taskId: t.id, x: e.pageX, y: e.pageY },
                            bubbles: true
                        });
                        this.container.dispatchEvent(event);
                    });

                    // DOUBLE CLICK EDIT
                    bar.addEventListener('dblclick', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Dispatch custom event to App
                        const event = new CustomEvent('app:task-edit', {
                            detail: { taskId: t.id },
                            bubbles: true
                        });
                        this.container.dispatchEvent(event);
                    });

                    // TOOLTIP
                    bar.addEventListener('mouseenter', (e) => {
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

                    bar.addEventListener('mouseleave', () => {
                        const event = new CustomEvent('app:tooltip-hide');
                        document.dispatchEvent(event);
                    });

                    daysContainer.append(bar);
                });

                row.append(daysContainer);
                scrollContainer.append(row);
            });

            this.container.append(scrollContainer);
        }

        changeYear(delta) {
            this.currentYear += delta;
            this.render();
        }
    }

    // Expose Global
    window.YearView = YearView;
})();
