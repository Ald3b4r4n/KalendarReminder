document.addEventListener('DOMContentLoaded', async function() {
    console.log('Aplicação iniciada - DOM carregado');

    // Configurações iniciais
    const store = localforage.createInstance({ name: 'KalendarReminder' });
    let calendar;
    let currentView = 'dayGridMonth';
    let darkMode = false;

    // Elementos da interface
    const calendarEl = document.getElementById('calendar');
    const eventModal = document.getElementById('eventModal');
    const eventBalloon = document.getElementById('eventBalloon');
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const viewToggleBtn = document.getElementById('viewToggleBtn');

    // Função para mostrar erros
    function showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = `
            <h3>Erro no aplicativo</h3>
            <p>${message}</p>
            <button onclick="window.location.reload()">Recarregar Página</button>
        `;
        document.body.appendChild(errorDiv);
    }

    try {
        // Inicializa o calendário imediatamente
        await initCalendar();
        
        // Inicializa os outros componentes
        initPWA();
        initEventModal();
        initViewToggle();
        initThemeToggle();
        initEventBalloon();
        
        console.log('Todos os componentes inicializados com sucesso');
    } catch (error) {
        console.error('Erro na inicialização:', error);
        showError('Erro ao iniciar o aplicativo: ' + error.message);
    }

    // Função para inicializar o calendário
    async function initCalendar() {
        try {
            console.log('Inicializando FullCalendar...');
            
            calendar = new FullCalendar.Calendar(calendarEl, {
                initialView: currentView,
                locale: 'pt-br',
                headerToolbar: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,timeGridDay'
                },
                buttonText: {
                    today: 'Hoje',
                    month: 'Mês',
                    week: 'Semana',
                    day: 'Dia'
                },
                dayHeaderFormat: {
                    weekday: 'short',
                    day: 'numeric'
                },
                columnHeaderFormat: {
                    weekday: 'short'
                },
                events: async (fetchInfo, successCallback) => {
                    try {
                        const events = [];
                        await store.iterate((value) => {
                            events.push({
                                ...value,
                                shortTitle: createAbbreviation(value.title)
                            });
                        });
                        successCallback(events);
                    } catch (error) {
                        console.error('Erro ao carregar eventos:', error);
                        successCallback([]);
                    }
                },
                eventClick: (info) => {
                    showEventBalloon(info.event);
                },
                dateClick: (info) => {
                    openEventModal(info.date);
                },
                eventDidMount: (info) => {
                    if (info.event.extendedProps.color) {
                        info.el.style.backgroundColor = info.event.extendedProps.color;
                        info.el.style.borderColor = info.event.extendedProps.color;
                    }
                }
            });

            await calendar.render();
            console.log('Calendário renderizado com sucesso');

        } catch (error) {
            console.error('Erro ao inicializar calendário:', error);
            throw error;
        }
    }

    // Função para alternar entre visualizações
    function initViewToggle() {
        viewToggleBtn.addEventListener('click', function() {
            currentView = currentView === 'dayGridMonth' ? 'timeGridWeek' : 'dayGridMonth';
            calendar.changeView(currentView);
            viewToggleBtn.textContent = currentView === 'dayGridMonth' ? 
                '📅 Visualização: Mês' : '📅 Visualização: Semana';
        });
    }

    // Função para alternar o tema
    function initThemeToggle() {
        darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (darkMode) {
            document.body.classList.add('dark-mode');
            themeToggleBtn.textContent = '☀️ Modo Claro';
        }

        themeToggleBtn.addEventListener('click', function() {
            darkMode = !darkMode;
            document.body.classList.toggle('dark-mode', darkMode);
            themeToggleBtn.textContent = darkMode ? '☀️ Modo Claro' : '🌙 Modo Escuro';
        });
    }

    // Função para criar abreviação
    function createAbbreviation(title) {
        if (!title) return '';
        if (title.length <= 4) return title;
        return title.split(' ')
            .filter(word => word.length > 0)
            .map(word => word[0].toUpperCase())
            .join('')
            .substring(0, 4);
    }

    // Função para abrir o modal de evento
    function openEventModal(date = null) {
        const now = new Date();
        const startInput = document.getElementById('eventStart');
        
        if (date) {
            startInput.value = date.toISOString().slice(0, 16);
        } else {
            startInput.value = now.toISOString().slice(0, 16);
        }
        
        document.getElementById('eventForm').reset();
        document.getElementById('abbreviationPreview').textContent = '';
        document.getElementById('recurringOptions').classList.add('hidden');
        document.getElementById('customRecurrence').classList.add('hidden');
        
        eventModal.style.display = 'block';
    }

    // Inicialização do PWA
    function initPWA() {
        let deferredPrompt;
        const installBtn = document.getElementById('installBtn');
        
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            installBtn.classList.remove('hidden');
        });

        installBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    installBtn.classList.add('hidden');
                }
                deferredPrompt = null;
            }
        });
        
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('ServiceWorker registrado:', registration.scope);
                })
                .catch(error => {
                    console.log('Falha no registro:', error);
                });
        }
        
        document.getElementById('clearAllBtn').addEventListener('click', async () => {
            if (confirm('Tem certeza que deseja apagar TODOS os eventos?')) {
                await store.clear();
                calendar.refetchEvents();
            }
        });
    }

    // Inicialização do modal de eventos
    function initEventModal() {
        const closeButton = document.querySelector('.modal .close');
        const eventForm = document.getElementById('eventForm');
        const eventTitle = document.getElementById('eventTitle');
        const abbreviationPreview = document.getElementById('abbreviationPreview');
        const isRecurringCheckbox = document.getElementById('isRecurring');
        const recurrencePatternSelect = document.getElementById('recurrencePattern');

        eventTitle.addEventListener('input', function() {
            abbreviationPreview.textContent = createAbbreviation(this.value);
        });

        isRecurringCheckbox.addEventListener('change', function() {
            document.getElementById('recurringOptions').classList.toggle('hidden', !this.checked);
        });

        recurrencePatternSelect.addEventListener('change', function() {
            const showCustom = this.value === 'custom' || this.value.includes('x');
            document.getElementById('customRecurrence').classList.toggle('hidden', !showCustom);
            
            switch (this.value) {
                case '12x36':
                    document.getElementById('hoursWorking').value = 12;
                    document.getElementById('hoursOff').value = 36;
                    break;
                case '24x48':
                    document.getElementById('hoursWorking').value = 24;
                    document.getElementById('hoursOff').value = 48;
                    break;
                case '24x72':
                    document.getElementById('hoursWorking').value = 24;
                    document.getElementById('hoursOff').value = 72;
                    break;
                case '48x144':
                    document.getElementById('hoursWorking').value = 48;
                    document.getElementById('hoursOff').value = 144;
                    break;
            }
        });

        closeButton.addEventListener('click', function() {
            eventModal.style.display = 'none';
        });

        window.addEventListener('click', function(event) {
            if (event.target === eventModal) {
                eventModal.style.display = 'none';
            }
        });

        eventForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const title = eventTitle.value;
            const color = document.getElementById('eventColor').value;
            const start = document.getElementById('eventStart').value;
            const end = document.getElementById('eventEnd').value || start;
            const reminderMinutes = parseInt(document.getElementById('eventReminder').value);
            const comment = document.getElementById('eventComment').value;
            const isRecurring = isRecurringCheckbox.checked;
            const recurrencePattern = recurrencePatternSelect.value;
            
            if (isRecurring) {
                await createRecurringEvents(title, color, start, end, reminderMinutes, recurrencePattern, comment);
            } else {
                await createSingleEvent(title, color, start, end, reminderMinutes, comment);
            }
            
            eventModal.style.display = 'none';
            calendar.refetchEvents();
        });
    }

    // Função para criar um único evento
    async function createSingleEvent(title, color, start, end, reminderMinutes, comment) {
        const eventId = 'event-' + Date.now();
        
        const event = {
            id: eventId,
            title: title,
            start: start,
            end: end,
            color: color,
            extendedProps: {
                reminderMinutes: reminderMinutes,
                color: color,
                shortTitle: createAbbreviation(title),
                comment: comment || null
            }
        };
        
        await store.setItem(eventId, event);
        scheduleNotification(event, reminderMinutes);
    }

    // Função para criar eventos recorrentes
    async function createRecurringEvents(title, color, start, end, reminderMinutes, pattern, comment) {
        const startDate = new Date(start);
        const endDate = new Date(end);
        const duration = endDate - startDate;
        
        let recurrenceEnd;
        let hoursWorking, hoursOff;
        
        if (pattern === 'custom' || pattern.includes('x')) {
            hoursWorking = parseInt(document.getElementById('hoursWorking').value);
            hoursOff = parseInt(document.getElementById('hoursOff').value);
            const customEnd = document.getElementById('recurrenceEnd').value;
            
            recurrenceEnd = customEnd ? new Date(customEnd) : new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate());
            
            switch (pattern) {
                case '12x36':
                    hoursWorking = 12;
                    hoursOff = 36;
                    break;
                case '24x48':
                    hoursWorking = 24;
                    hoursOff = 48;
                    break;
                case '24x72':
                    hoursWorking = 24;
                    hoursOff = 72;
                    break;
                case '48x144':
                    hoursWorking = 48;
                    hoursOff = 144;
                    break;
            }
            
            let currentStart = new Date(startDate);
            let currentEnd = new Date(currentStart.getTime() + duration);
            let cycle = 0;
            
            while (currentStart < recurrenceEnd) {
                const eventId = `event-${Date.now()}-${cycle}`;
                
                const event = {
                    id: eventId,
                    title: title,
                    start: currentStart.toISOString(),
                    end: currentEnd.toISOString(),
                    color: color,
                    extendedProps: {
                        reminderMinutes: reminderMinutes,
                        color: color,
                        shortTitle: createAbbreviation(title),
                        comment: comment || null
                    }
                };
                
                await store.setItem(eventId, event);
                scheduleNotification(event, reminderMinutes);
                
                currentStart = new Date(currentEnd.getTime() + (hoursOff * 60 * 60 * 1000));
                currentEnd = new Date(currentStart.getTime() + duration);
                cycle++;
            }
            
            return;
        }
        
        let interval;
        switch (pattern) {
            case 'daily': interval = { days: 1 }; break;
            case 'weekly': interval = { weeks: 1 }; break;
            case 'monthly': interval = { months: 1 }; break;
            default: interval = { days: 1 };
        }
        
        recurrenceEnd = new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate());
        let currentStart = new Date(startDate);
        let currentEnd = new Date(endDate);
        let cycle = 0;
        
        while (currentStart < recurrenceEnd) {
            const eventId = `event-${Date.now()}-${cycle}`;
            
            const event = {
                id: eventId,
                title: title,
                start: currentStart.toISOString(),
                end: currentEnd.toISOString(),
                color: color,
                extendedProps: {
                    reminderMinutes: reminderMinutes,
                    color: color,
                    shortTitle: createAbbreviation(title),
                    comment: comment || null
                }
            };
            
            await store.setItem(eventId, event);
            scheduleNotification(event, reminderMinutes);
            
            currentStart = addInterval(currentStart, interval);
            currentEnd = addInterval(currentEnd, interval);
            cycle++;
        }
    }

    // Função auxiliar para adicionar intervalo a uma data
    function addInterval(date, interval) {
        const newDate = new Date(date);
        if (interval.days) newDate.setDate(newDate.getDate() + interval.days);
        if (interval.weeks) newDate.setDate(newDate.getDate() + (interval.weeks * 7));
        if (interval.months) newDate.setMonth(newDate.getMonth() + interval.months);
        return newDate;
    }

    // Função para agendar notificação
    function scheduleNotification(event, minutesBefore) {
        if (!('Notification' in window)) return;
        
        if (Notification.permission === 'granted') {
            createNotification(event, minutesBefore);
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    createNotification(event, minutesBefore);
                }
            });
        }
    }

    function createNotification(event, minutesBefore) {
        const eventTime = new Date(event.start);
        const notifyTime = new Date(eventTime.getTime() - (minutesBefore * 60 * 1000));
        const now = new Date();
        
        if (notifyTime <= now) return;
        
        const timeout = notifyTime.getTime() - now.getTime();
        
        setTimeout(() => {
            new Notification(`Lembrete: ${event.title}`, {
                body: `O evento começa em ${minutesBefore} minutos!`,
                icon: '/assets/favicon.ico'
            });
        }, timeout);
    }

    // Inicialização do balão de eventos
    function initEventBalloon() {
        const closeButton = document.querySelector('.balloon-close');
        const deleteButton = document.getElementById('deleteEventBtn');

        closeButton.addEventListener('click', hideEventBalloon);

        deleteButton.addEventListener('click', async function() {
            const eventId = this.dataset.eventId;
            if (eventId && confirm('Deseja remover este evento?')) {
                await store.removeItem(eventId);
                calendar.refetchEvents();
                hideEventBalloon();
            }
        });

        window.addEventListener('click', function(event) {
            if (!eventBalloon.classList.contains('hidden') && 
                !event.target.closest('.balloon') && 
                !event.target.closest('.fc-event')) {
                hideEventBalloon();
            }
        });
    }

    // Função para mostrar o balão de evento
    function showEventBalloon(event) {
        const balloonTitle = document.getElementById('balloonTitle');
        const balloonStart = document.getElementById('balloonStart');
        const balloonEnd = document.getElementById('balloonEnd');
        const balloonReminder = document.getElementById('balloonReminder');
        const balloonComment = document.getElementById('balloonComment');
        const balloonCommentLabel = document.getElementById('balloonCommentLabel');
        const deleteButton = document.getElementById('deleteEventBtn');

        balloonTitle.textContent = event.title;
        
        const startDate = new Date(event.start);
        balloonStart.textContent = startDate.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        if (event.end) {
            const endDate = new Date(event.end);
            balloonEnd.textContent = endDate.toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } else {
            balloonEnd.textContent = "Não definido";
        }
        
        balloonReminder.textContent = `${event.extendedProps.reminderMinutes} minutos antes`;
        
        if (event.extendedProps.comment) {
            balloonComment.textContent = event.extendedProps.comment;
            balloonCommentLabel.classList.add('show');
        } else {
            balloonCommentLabel.classList.remove('show');
        }
        
        deleteButton.dataset.eventId = event.id;
        eventBalloon.classList.remove('hidden');
    }

    // Função para esconder o balão de evento
    function hideEventBalloon() {
        eventBalloon.classList.add('hidden');
    }
});