// Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDc7bXNMz2d8eottzVwZluhbgjwARtsGZY",
    authDomain: "kalendarreminder.firebaseapp.com",
    projectId: "kalendarreminder",
    storageBucket: "kalendarreminder.appspot.com",
    messagingSenderId: "79847287028",
    appId: "1:79847287028:web:3a2beae2e9ed996f8f16a1",
    measurementId: "G-F5BGCR3HVL"
};

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const eventsCollection = db.collection("events");

// Variáveis globais
let currentEventId = null;
let deferredPrompt = null;

document.addEventListener('DOMContentLoaded', function() {
    // Elementos DOM
    const elements = {
        calendarEl: document.getElementById('calendar'),
        eventModal: document.getElementById('eventModal'),
        eventForm: document.getElementById('eventForm'),
        eventBalloon: document.getElementById('eventBalloon'),
        themeToggleBtn: document.getElementById('themeToggleBtn'),
        viewToggleBtn: document.getElementById('viewToggleBtn'),
        addEventBtn: document.getElementById('addEventBtn'),
        clearAllBtn: document.getElementById('clearAllBtn'),
        deleteEventBtn: document.getElementById('deleteEventBtn'),
        installBtn: document.getElementById('installBtn')
    };

    // Inicializa o calendário
    const calendar = new FullCalendar.Calendar(elements.calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'pt-br',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        eventDisplay: 'block',
        height: 'auto',
        contentHeight: 'auto',
        eventClick: function(info) {
            showEventDetails(info.event);
        },
        events: function(fetchInfo, successCallback, failureCallback) {
            loadEvents(fetchInfo, successCallback);
        }
    });
    calendar.render();

    // Event Listeners
    setupEventListeners(elements, calendar);

    // Carrega preferências do usuário
    loadUserPreferences();

    // Verifica se é PWA instalado
    checkPWAInstallation();

    // Função para configurar listeners
    function setupEventListeners(elements, calendar) {
        // Botão para adicionar novo evento
        elements.addEventBtn.addEventListener('click', () => {
            resetEventForm();
            elements.eventModal.style.display = 'block';
        });

        // Fechar modal
        document.querySelector('.close').addEventListener('click', () => {
            elements.eventModal.style.display = 'none';
        });

        // Fechar balão de evento
        document.querySelector('.balloon-close').addEventListener('click', () => {
            elements.eventBalloon.classList.add('hidden');
        });

        // Alternar tema escuro/claro
        elements.themeToggleBtn.addEventListener('click', () => {
            toggleDarkMode();
            calendar.updateSize();
        });

        // Alternar visualização do calendário
        elements.viewToggleBtn.addEventListener('click', () => {
            toggleCalendarView(calendar);
        });

        // Formulário de evento
        elements.eventForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveEvent(calendar);
        });

        // Mostrar/ocultar opções recorrentes
        document.getElementById('isRecurring').addEventListener('change', () => {
            document.getElementById('recurringOptions').classList.toggle('hidden');
        });

        // Preview de abreviação do título
        document.getElementById('eventTitle').addEventListener('input', () => {
            updateTitleAbbreviation();
        });

        // Limpar todos os eventos
        elements.clearAllBtn.addEventListener('click', () => {
            clearAllEvents(calendar);
        });

        // Instalar PWA
        elements.installBtn.addEventListener('click', () => {
            installPWA();
        });

        // Evento beforeinstallprompt para PWA
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            elements.installBtn.classList.remove('hidden');
        });

        // Verifica se o PWA já está instalado
        window.addEventListener('appinstalled', () => {
            elements.installBtn.classList.add('hidden');
            showToast('Aplicativo instalado com sucesso!', 'success');
        });
    }

    // Função para carregar eventos do Firestore
    async function loadEvents(fetchInfo, successCallback) {
        try {
            const snapshot = await eventsCollection
                .where('start', '>=', fetchInfo.start)
                .where('start', '<=', fetchInfo.end)
                .get();
            
            const events = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    title: data.title,
                    start: data.start.toDate(),
                    end: data.end ? data.end.toDate() : null,
                    backgroundColor: data.color,
                    borderColor: data.color,
                    extendedProps: {
                        comment: data.comment,
                        isRecurring: data.isRecurring,
                        recurrencePattern: data.recurrencePattern,
                        email: data.email,
                        reminder: data.reminder
                    }
                };
            });
            
            successCallback(events);
        } catch (error) {
            console.error("Erro ao carregar eventos:", error);
            showToast('Erro ao carregar eventos', 'error');
        }
    }

    // Função para salvar evento no Firestore
    async function saveEvent(calendar) {
        const eventData = getFormData();
        
        try {
            if (currentEventId) {
                // Atualizar evento existente
                await eventsCollection.doc(currentEventId).update(eventData);
                showToast('Evento atualizado com sucesso!', 'success');
            } else {
                // Adicionar novo evento
                const docRef = await eventsCollection.add(eventData);
                
                // Se for recorrente, criar as ocorrências
                if (eventData.isRecurring) {
                    await createRecurringEvents(docRef.id, eventData);
                }
                
                showToast('Evento adicionado com sucesso!', 'success');
            }
            
            calendar.refetchEvents();
            elements.eventModal.style.display = 'none';
        } catch (error) {
            console.error("Erro ao salvar evento:", error);
            showToast('Erro ao salvar evento', 'error');
        }
    }

    // Função para criar eventos recorrentes
    async function createRecurringEvents(parentId, eventData) {
        const occurrences = generateRecurrences(eventData);
        
        try {
            const batch = db.batch();
            
            occurrences.forEach(occurrence => {
                const eventRef = eventsCollection.doc();
                batch.set(eventRef, {
                    ...occurrence,
                    parentId: parentId
                });
            });
            
            await batch.commit();
        } catch (error) {
            console.error("Erro ao criar eventos recorrentes:", error);
        }
    }

    // Função para gerar ocorrências recorrentes
    function generateRecurrences(eventData) {
        const pattern = eventData.recurrencePattern;
        const startDate = new Date(eventData.start);
        const endDate = eventData.end ? new Date(eventData.end) : null;
        const occurrences = [];
        
        // Lógica para gerar ocorrências baseadas no padrão
        // (implementação simplificada - expandir conforme necessário)
        switch(pattern) {
            case 'daily':
                for (let i = 1; i <= 30; i++) {
                    const newStart = new Date(startDate);
                    newStart.setDate(newStart.getDate() + i);
                    
                    const newEnd = endDate ? new Date(endDate) : null;
                    if (newEnd) newEnd.setDate(newEnd.getDate() + i);
                    
                    occurrences.push(createOccurrence(eventData, newStart, newEnd));
                }
                break;
                
            // Implementar outros padrões (weekly, monthly, etc.)
            default:
                break;
        }
        
        return occurrences;
    }

    // Função auxiliar para criar ocorrência
    function createOccurrence(eventData, start, end) {
        return {
            title: eventData.title,
            start: start,
            end: end,
            color: eventData.color,
            comment: eventData.comment,
            email: eventData.email,
            reminder: eventData.reminder,
            isRecurring: false,
            recurrencePattern: null
        };
    }

    // Função para mostrar detalhes do evento
    function showEventDetails(event) {
        currentEventId = event.id;
        
        document.getElementById('balloonTitle').textContent = event.title;
        document.getElementById('balloonStart').textContent = formatDateTime(event.start);
        document.getElementById('balloonEnd').textContent = event.end ? formatDateTime(event.end) : 'Não definido';
        document.getElementById('balloonReminder').textContent = `${event.extendedProps.reminder} minutos antes`;
        document.getElementById('balloonComment').textContent = event.extendedProps.comment || 'Nenhum comentário';
        
        // Configurar botão de deletar
        elements.deleteEventBtn.onclick = async () => {
            if (confirm(`Remover o evento "${event.title}"?`)) {
                try {
                    await eventsCollection.doc(event.id).delete();
                    calendar.refetchEvents();
                    elements.eventBalloon.classList.add('hidden');
                    showToast('Evento removido com sucesso', 'success');
                } catch (error) {
                    console.error("Erro ao remover evento:", error);
                    showToast('Erro ao remover evento', 'error');
                }
            }
        };
        
        elements.eventBalloon.classList.remove('hidden');
    }

    // Função para obter dados do formulário
    function getFormData() {
        return {
            title: document.getElementById('eventTitle').value,
            start: new Date(document.getElementById('eventStart').value),
            end: document.getElementById('eventEnd').value ? 
                 new Date(document.getElementById('eventEnd').value) : null,
            color: document.getElementById('eventColor').value,
            comment: document.getElementById('eventComment').value,
            email: document.getElementById('eventEmail').value,
            reminder: document.getElementById('eventReminder').value,
            isRecurring: document.getElementById('isRecurring').checked,
            recurrencePattern: document.getElementById('isRecurring').checked ? 
                             document.getElementById('recurrencePattern').value : null
        };
    }

    // Função para resetar o formulário
    function resetEventForm() {
        currentEventId = null;
        elements.eventForm.reset();
        document.getElementById('recurringOptions').classList.add('hidden');
        document.getElementById('abbreviationPreview').textContent = '-';
        
        // Definir data/hora padrão (agora + 1 hora)
        const now = new Date();
        const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
        
        document.getElementById('eventStart').value = formatDateTimeLocal(now);
        document.getElementById('eventEnd').value = formatDateTimeLocal(oneHourLater);
    }

    // Função para limpar todos os eventos
    async function clearAllEvents(calendar) {
        if (confirm('Tem certeza que deseja remover TODOS os eventos?')) {
            try {
                const batch = db.batch();
                const snapshot = await eventsCollection.get();
                
                snapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
                });
                
                await batch.commit();
                calendar.refetchEvents();
                showToast('Todos os eventos foram removidos', 'success');
            } catch (error) {
                console.error("Erro ao remover eventos:", error);
                showToast('Erro ao remover eventos', 'error');
            }
        }
    }

    // Função para alternar visualização do calendário
    function toggleCalendarView(calendar) {
        const currentView = calendar.view.type;
        let newView, viewName;

        switch(currentView) {
            case 'dayGridMonth':
                newView = 'timeGridWeek';
                viewName = 'Semana';
                break;
            case 'timeGridWeek':
                newView = 'timeGridDay';
                viewName = 'Dia';
                break;
            default:
                newView = 'dayGridMonth';
                viewName = 'Mês';
        }

        calendar.changeView(newView);
        document.querySelector('#viewToggleBtn span').textContent = `Visualização: ${viewName}`;
    }

    // Função para alternar modo escuro
    function toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
    }

    // Função para carregar preferências do usuário
    function loadUserPreferences() {
        // Tema
        if (localStorage.getItem('darkMode') === 'true') {
            document.body.classList.add('dark-mode');
        }
    }

    // Função para atualizar a abreviação do título
    function updateTitleAbbreviation() {
        const title = document.getElementById('eventTitle').value;
        const abbreviation = title.split(' ').map(word => word[0]).join('').toUpperCase();
        document.getElementById('abbreviationPreview').textContent = abbreviation || '-';
    }

    // Funções para instalação PWA
    function checkPWAInstallation() {
        if (window.matchMedia('(display-mode: standalone)').matches) {
            elements.installBtn.classList.add('hidden');
        }
    }

    function installPWA() {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    elements.installBtn.classList.add('hidden');
                }
                deferredPrompt = null;
            });
        }
    }

    // Funções auxiliares
    function formatDateTime(date) {
        return date.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function formatDateTimeLocal(date) {
        return date.toISOString().slice(0, 16);
    }

    function showToast(message, type) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    }

    // Adiciona CSS para toast notification
    const toastCSS = `
    .toast {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        border-radius: 4px;
        color: white;
        background-color: #333;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        opacity: 0;
        transition: opacity 0.3s ease;
        z-index: 1000;
    }
    .toast.show {
        opacity: 1;
    }
    .toast.success {
        background-color: var(--success-color);
    }
    .toast.error {
        background-color: var(--danger-color);
    }`;
    
    const style = document.createElement('style');
    style.innerHTML = toastCSS;
    document.head.appendChild(style);
});