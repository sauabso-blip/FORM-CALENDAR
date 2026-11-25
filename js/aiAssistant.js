// js/aiAssistant.js
// Asistente de IA para la Agenda Personal conectado a API de Ollama / Cloud

class AIAssistant {
    constructor(store, getAppState) {
        this.store = store;
        this.getAppState = getAppState;
        this.messages = [];
        this.isProcessing = false;
        this.lastReferencedTaskId = null;

        this.loadSettings();
        this._bindUI();
    }

    loadSettings() {
        let ep = (localStorage.getItem('agenda_ai_endpoint') || 'https://api.groq.com/openai/v1').trim().replace(/\/+$/, '');
        let key = (localStorage.getItem('agenda_ai_key') || '').trim();
        let model = (localStorage.getItem('agenda_ai_model') || 'llama-3.1-8b-instant').trim().replace(/[`'"]/g, '');

        // Si la clave es de Groq (empieza por gsk_), forzar endpoint de Groq si estaba en localhost
        if (key.startsWith('gsk_') && !ep.includes('groq.com')) {
            ep = 'https://api.groq.com/openai/v1';
            localStorage.setItem('agenda_ai_endpoint', ep);
        }

        this.endpoint = ep;
        this.apiKey = key;
        this.model = model;
        this._updateStatusLabel();
    }

    _updateStatusLabel() {
        const label = document.getElementById('ai-status-label');
        if (!label) return;
        const isGroq = (this.endpoint || '').includes('groq.com');
        const isOllama = (this.endpoint || '').includes('localhost') || (this.endpoint || '').includes('11434');
        const provName = isGroq ? 'Groq Cloud' : (isOllama ? 'Ollama Local' : 'API');
        label.textContent = `${provName} (${this.model || 'Sin modelo'})`;
        label.title = `Endpoint: ${this.endpoint}\nModelo: ${this.model}`;
    }

    saveSettings(endpoint, apiKey, model) {
        let ep = (endpoint || 'https://api.groq.com/openai/v1').trim().replace(/\/+$/, '');
        let key = (apiKey || '').trim();
        let mdl = (model || 'llama-3.1-8b-instant').trim().replace(/[`'"]/g, '');

        if (ep.includes('api.groq.com') && !ep.includes('/openai/v1')) {
            ep = 'https://api.groq.com/openai/v1';
        }
        if (key.startsWith('gsk_') && !ep.includes('groq.com')) {
            ep = 'https://api.groq.com/openai/v1';
        }

        this.endpoint = ep;
        this.apiKey = key;
        this.model = mdl;

        localStorage.setItem('agenda_ai_endpoint', this.endpoint);
        localStorage.setItem('agenda_ai_key', this.apiKey);
        localStorage.setItem('agenda_ai_model', this.model);

        this._updateStatusLabel();
    }

    _bindUI() {
        this.panel = document.getElementById('ai-chat-modal') || document.getElementById('ai-chat-panel');
        this.btnToggle = document.getElementById('btn-toggle-ai');
        this.btnClose = document.getElementById('btn-close-ai');
        this.btnClear = document.getElementById('btn-clear-ai-chat');
        this.messagesContainer = document.getElementById('ai-messages-list');
        this.inputPrompt = document.getElementById('ai-input-prompt');
        this.btnSend = document.getElementById('btn-ai-send');
        this.statusIndicator = document.getElementById('ai-status-indicator');

        if (this.btnToggle) {
            this.btnToggle.addEventListener('click', () => this.togglePanel());
        }

        if (this.btnClose) {
            this.btnClose.addEventListener('click', () => this.closePanel());
        }

        if (this.btnClear) {
            this.btnClear.addEventListener('click', () => {
                if (confirm('¿Deseas reiniciar la conversación con el Asistente IA?')) {
                    this.messages = [];
                    if (this.messagesContainer) {
                        this.messagesContainer.innerHTML = '';
                    }
                    this._addWelcomeMessage();
                    if (this.inputPrompt) this.inputPrompt.focus();
                }
            });
        }

        // Close on clicking backdrop overlay
        if (this.panel) {
            this.panel.addEventListener('click', (e) => {
                if (e.target === this.panel) {
                    this.closePanel();
                }
            });
        }

        // Close on Escape key
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.panel && this.panel.style.display !== 'none') {
                this.closePanel();
            }
        });

        if (this.btnSend && this.inputPrompt) {
            this.btnSend.addEventListener('click', () => this.handleSendMessage());
            this.inputPrompt.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSendMessage();
                }
            });
        }

        // Quick prompt chips
        document.querySelectorAll('.ai-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const text = chip.getAttribute('data-prompt');
                if (text && this.inputPrompt) {
                    this.inputPrompt.value = text;
                    this.handleSendMessage();
                }
            });
        });

        // Config Modal bindings
        this._bindConfigUI();
    }

    _bindConfigUI() {
        const inputEndpoint = document.getElementById('ai-config-endpoint');
        const inputKey = document.getElementById('ai-config-key');
        const inputModel = document.getElementById('ai-config-model');
        const selectModel = document.getElementById('ai-config-model-select');
        const btnPresetGroq = document.getElementById('btn-preset-groq');
        const btnPresetOllama = document.getElementById('btn-preset-ollama');
        const btnDetect = document.getElementById('btn-detect-ai-models');
        const btnSave = document.getElementById('btn-save-ai-config');
        const statusMsg = document.getElementById('ai-config-status');

        if (inputEndpoint) inputEndpoint.value = this.endpoint;
        if (inputKey) inputKey.value = this.apiKey;
        if (inputModel) inputModel.value = this.model;

        if (selectModel && inputModel) {
            let exists = false;
            for (let opt of selectModel.options) {
                if (opt.value === this.model) {
                    selectModel.value = this.model;
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                selectModel.value = 'custom';
            }

            selectModel.addEventListener('change', () => {
                if (selectModel.value !== 'custom') {
                    inputModel.value = selectModel.value;
                }
            });

            inputModel.addEventListener('input', () => {
                selectModel.value = 'custom';
            });
        }

        // Preset: Groq Cloud
        if (btnPresetGroq) {
            btnPresetGroq.addEventListener('click', async () => {
                inputEndpoint.value = 'https://api.groq.com/openai/v1';
                const key = (inputKey.value || '').trim();
                if (!key) {
                    inputKey.focus();
                    alert("Introduce primero tu clave API de Groq (gsk_...) en el campo de Clave API y vuelve a pulsar este botón.");
                    return;
                }
                btnPresetGroq.disabled = true;
                btnPresetGroq.textContent = 'Configurando Groq...';
                await this._detectModelsInternal(inputEndpoint.value, key, true, selectModel, inputModel, statusMsg);
                this.saveSettings(inputEndpoint.value, inputKey.value, inputModel.value);
                btnPresetGroq.disabled = false;
                btnPresetGroq.textContent = '🚀 Usar Groq Cloud (Gratuito, rápido y móvil)';
            });
        }

        // Preset: Ollama Local
        if (btnPresetOllama) {
            btnPresetOllama.addEventListener('click', () => {
                inputEndpoint.value = 'http://localhost:11434';
                inputKey.value = '';
                inputModel.value = 'llama3.2';
                if (selectModel) selectModel.value = 'custom';
                this.saveSettings(inputEndpoint.value, inputKey.value, inputModel.value);
                if (statusMsg) {
                    statusMsg.textContent = 'Ollama Local configurado (http://localhost:11434).';
                    statusMsg.style.display = 'block';
                    setTimeout(() => { statusMsg.style.display = 'none'; }, 3000);
                }
            });
        }

        // Detect models button
        if (btnDetect) {
            btnDetect.addEventListener('click', async () => {
                const ep = (inputEndpoint.value || '').trim();
                const key = (inputKey.value || '').trim();
                btnDetect.disabled = true;
                btnDetect.textContent = 'Buscando...';
                await this._detectModelsInternal(ep, key, false, selectModel, inputModel, statusMsg);
                btnDetect.disabled = false;
                btnDetect.textContent = '🔄 Detectar Modelos';
            });
        }

        if (btnSave) {
            btnSave.addEventListener('click', () => {
                this.saveSettings(inputEndpoint.value, inputKey.value, inputModel.value);
                if (statusMsg) {
                    statusMsg.textContent = 'Configuración guardada correctamente.';
                    statusMsg.style.display = 'block';
                    setTimeout(() => { statusMsg.style.display = 'none'; }, 3000);
                }
            });
        }
    }

    async _fetchAvailableModelsList(endpointUrl, apiKey) {
        let url = (endpointUrl || 'https://api.groq.com/openai/v1').trim().replace(/\/+$/, '');
        let modelsUrl = url.endsWith('/v1') ? `${url}/models` : `${url}/v1/models`;
        if (url.includes('/api/chat') || url.includes('11434')) {
            modelsUrl = url.includes('/api/chat') ? url.replace('/api/chat', '/api/tags') : `${url}/api/tags`;
        }

        const headers = {};
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

        const res = await fetch(modelsUrl, { headers });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`HTTP ${res.status}: ${errText}`);
        }

        const data = await res.json();
        let modelsList = [];
        if (Array.isArray(data.data)) {
            modelsList = data.data.map(m => m.id);
        } else if (Array.isArray(data.models)) {
            modelsList = data.models.map(m => m.name || m.model || m.id);
        }
        return modelsList;
    }

    async _detectModelsInternal(ep, key, autoSelect, selectModel, inputModel, statusMsg) {
        try {
            const modelsList = await this._fetchAvailableModelsList(ep, key);
            if (!modelsList || modelsList.length === 0) {
                alert("No se devolvió ningún modelo disponible en este servidor.");
                return;
            }

            if (selectModel) {
                selectModel.innerHTML = '';
                modelsList.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m;
                    opt.textContent = m;
                    selectModel.appendChild(opt);
                });
                const optCustom = document.createElement('option');
                optCustom.value = 'custom';
                optCustom.textContent = '-- Escribir manualmente abajo --';
                selectModel.appendChild(optCustom);

                // Prioridad de selección inteligente
                const preferred = modelsList.find(m => m === 'llama-3.1-8b-instant')
                    || modelsList.find(m => m === 'llama-3.3-70b-versatile')
                    || modelsList.find(m => m.includes('8b-instant'))
                    || modelsList.find(m => m.includes('llama-3.1'))
                    || modelsList.find(m => m.includes('llama3'))
                    || modelsList.find(m => m.includes('gemma2'))
                    || modelsList[0];

                if (autoSelect || !inputModel.value || !modelsList.includes(inputModel.value)) {
                    selectModel.value = preferred;
                    if (inputModel) inputModel.value = preferred;
                } else if (modelsList.includes(inputModel.value)) {
                    selectModel.value = inputModel.value;
                }
            }

            if (statusMsg) {
                statusMsg.textContent = `¡Éxito! ${modelsList.length} modelos detectados. Modelo elegido: ${inputModel?.value || ''}`;
                statusMsg.style.display = 'block';
                setTimeout(() => { statusMsg.style.display = 'none'; }, 4000);
            }
            alert(`¡Conexión establecida con éxito!\n\nSe han detectado ${modelsList.length} modelos disponibles en tu cuenta:\n• ` + modelsList.slice(0, 8).join('\n• ') + (modelsList.length > 8 ? `\n...y ${modelsList.length - 8} más` : ''));

        } catch (err) {
            console.error("Error al detectar modelos:", err);
            alert("Error al conectar y listar modelos:\n" + (err.message || err) + "\n\nVerifica que la URL y la Clave API sean correctas.");
        }
    }

    togglePanel() {
        if (!this.panel) return;
        const isVisible = this.panel.style.display !== 'none' && this.panel.style.display !== '';
        if (isVisible) {
            this.closePanel();
        } else {
            this.openPanel();
        }
    }

    openPanel() {
        if (!this.panel) return;
        this.panel.style.display = 'flex';
        this.panel.classList.add('open');
        if (this.messages.length === 0) {
            this._addWelcomeMessage();
        }
        if (this.inputPrompt) {
            setTimeout(() => {
                this.inputPrompt.focus();
                if (this.messagesContainer) {
                    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                }
            }, 80);
        }
    }

    closePanel() {
        if (!this.panel) return;
        this.panel.style.display = 'none';
        this.panel.classList.remove('open');
    }

    _addWelcomeMessage() {
        this.renderMessage({
            role: 'assistant',
            text: `¡Hola! Soy tu asistente de agenda. Puedo responder preguntas sobre tus tareas y gastos, o añadir nuevas entradas por ti.\n\nPrueba a decirme:\n• *"¿Qué tareas tengo esta semana?"*\n• *"He gastado 35€ en una cena hoy"*\n• *"Reunión con Juan el viernes a las 11:00"*`
        });
    }

    async handleSendMessage() {
        if (this.isProcessing) return;
        const text = this.inputPrompt.value.trim();
        if (!text) return;

        this.inputPrompt.value = '';
        this.renderMessage({ role: 'user', text });

        if (!this.endpoint) {
            this.renderMessage({
                role: 'assistant',
                isError: true,
                text: '⚠️ No has configurado la URL de Ollama / Cloud. Ve a ⚙ Configurar → Inteligencia Artificial para indicar tu Endpoint y Clave API.'
            });
            return;
        }

        this.isProcessing = true;
        this._setLoading(true);

        try {
            const systemPrompt = this._buildSystemPrompt();
            const history = this.messages.map(m => ({ role: m.role, content: m.text }));
            const apiMessages = [
                { role: 'system', content: systemPrompt },
                ...history
            ];

            const responseText = await this._callOllamaAPI(apiMessages);
            await this._processAssistantResponse(responseText, text);

        } catch (err) {
            console.error("Error en AIAssistant:", err);
            const activeModel = (this.model || '').trim();
            const isGroq = (this.endpoint || '').includes('groq.com');
            const provName = isGroq ? 'Groq Cloud' : 'Ollama Local / API';
            const maskedKey = this.apiKey ? `${this.apiKey.substring(0, 6)}...${this.apiKey.slice(-4)}` : '(No configurada)';

            let hint = '💡 Abre ⚙ Configurar → 🤖 IA y pulsa el botón "🚀 Usar Groq Cloud" o "🔄 Detectar Modelos" para guardar el modelo correcto.';
            if (!this.apiKey && isGroq) {
                hint = '💡 Falta tu clave API de Groq. Ve a ⚙ Configurar → 🤖 IA, pega tu clave (gsk_...) y pulsa "🚀 Usar Groq Cloud".';
            }

            this.renderMessage({
                role: 'assistant',
                isError: true,
                text: `❌ Error al conectar con ${provName}:\n${err.message || err}\n\n📌 Endpoint: ${this.endpoint}\n🤖 Modelo: "${activeModel}"\n🔑 Clave: ${maskedKey}\n\n${hint}`
            });
        } finally {
            this.isProcessing = false;
            this._setLoading(false);
        }
    }

    _buildSystemPrompt() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;
        const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const dayOfWeek = dayNames[now.getDay()];

        const categories = this.store.getCategories().map(c => ({
            id: c.id,
            name: c.name
        }));

        const tasks = this.store.getTasks().map(t => {
            const cat = categories.find(c => c.id === t.categoryId);
            return {
                id: t.id,
                name: t.name,
                category: cat ? cat.name : 'General',
                categoryId: t.categoryId,
                startDate: t.startDate,
                endDate: t.endDate,
                time: t.time || null,
                amount: t.amount || null,
                location: t.location || null,
                comments: t.comments || null
            };
        });

        return `Eres el asistente inteligente de una Agenda Personal y Gestor de Tareas/Gastos.
FECHA ACTUAL DE REFERENCIA: ${todayStr} (${dayOfWeek}).
AÑO ACTUAL: ${year}.

CATEGORÍAS ACTIVAS:
${JSON.stringify(categories, null, 2)}

LISTA COMPLETA DE TAREAS Y EVENTOS EN LA AGENDA (${tasks.length} en total):
${JSON.stringify(tasks.slice(-60), null, 2)}

REGLAS FUNDAMENTALES:
1. Responde de forma concisa, educada y natural en español.
2. Si el usuario te hace preguntas o consultas, responde analizando la lista de arriba.
3. SIEMPRE QUE EL USUARIO PIDA UNA ACCIÓN (crear, eliminar o modificar tareas/gastos), es TOTALMENTE OBLIGATORIO que incluyas al final de tu mensaje un único bloque de código JSON con la orden a ejecutar. Si no incluyes el bloque JSON, la acción NO se realizará.

FORMATOS DE ACCIÓN PERMITIDOS:

A) CREAR / AÑADIR:
\`\`\`json
{
  "action": "create_task",
  "data": {
    "name": "Título de la entrada",
    "categoryId": "ID_DE_LA_CATEGORIA",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "time": "HH:MM o null",
    "reminder": "none | on_time | 15m | 1h | 1d",
    "amount": 35.50 o null
  }
}
\`\`\`

B) ELIMINAR / BORRAR:
Busca la tarea en la lista de arriba y pon su "taskId" y su "name":
\`\`\`json
{
  "action": "delete_task",
  "data": {
    "taskId": "ID_DE_LA_TAREA_A_ELIMINAR",
    "name": "Título de la tarea a eliminar"
  }
}
\`\`\`

C) MODIFICAR / CAMBIAR FECHAS O DÍAS:
Busca la tarea en la lista de arriba, pon su "taskId" y los campos que cambian (como startDate y endDate en formato YYYY-MM-DD):
\`\`\`json
{
  "action": "update_task",
  "data": {
    "taskId": "ID_DE_LA_TAREA_A_MODIFICAR",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD"
  }
}
\`\`\`

EJEMPLOS DE COMPORTAMIENTO:
- Si el usuario dice: "Elimina la tarea VIAJE ASTURIAS"
  Tu respuesta debe terminar con:
  \`\`\`json
  { "action": "delete_task", "data": { "taskId": "...", "name": "VIAJE ASTURIAS (STAV)" } }
  \`\`\`

- Si el usuario dice: "Cambia las fechas del viaje a Asturias del 1 al 5 de diciembre"
  Tu respuesta debe terminar con:
  \`\`\`json
  { "action": "update_task", "data": { "taskId": "...", "name": "VIAJE ASTURIAS (STAV)", "startDate": "${year}-12-01", "endDate": "${year}-12-05" } }
  \`\`\`

- Si el usuario dice: "Cámbiala de fecha" o "elimínala", hazlo sobre la última tarea mencionada.`;
    }

    async _callOllamaAPI(messages, isRetry = false) {
        let url = (this.endpoint || 'https://api.groq.com/openai/v1').trim().replace(/\/+$/, '');
        let cleanModel = (this.model || 'llama-3.1-8b-instant').trim().replace(/[`'"]/g, '');

        if (url.includes('api.groq.com') && !url.includes('/openai/v1')) {
            url = 'https://api.groq.com/openai/v1';
        }

        const headers = {
            'Content-Type': 'application/json'
        };

        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        // Determine if using native Ollama (/api/chat) or OpenAI-compatible (/v1/chat/completions)
        const isNativeOllama = url.includes('/api/chat') || url.includes('11434');
        let requestUrl = url;
        let body = {};

        if (isNativeOllama) {
            if (!requestUrl.endsWith('/api/chat')) {
                requestUrl = `${requestUrl}/api/chat`;
            }
            body = {
                model: cleanModel,
                messages: messages,
                stream: false
            };
        } else {
            // OpenAI-compatible format (Groq, OpenAI, etc.)
            if (!url.endsWith('/chat/completions')) {
                requestUrl = url.endsWith('/v1') ? `${url}/chat/completions` : `${url}/v1/chat/completions`;
            }
            body = {
                model: cleanModel,
                messages: messages,
                temperature: 0.3
            };
        }

        const response = await fetch(requestUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            let errorText = await response.text();
            try {
                const parsed = JSON.parse(errorText);
                errorText = parsed.error?.message || parsed.error || errorText;
            } catch (e) { }

            // Auto-recuperación si el modelo da 404 (model not found / does not exist)
            if (response.status === 404 && this.apiKey && !isRetry) {
                console.warn(`Modelo "${cleanModel}" no encontrado (404). Intentando auto-detectar modelos disponibles...`);
                try {
                    const detected = await this._fetchAvailableModelsList(url, this.apiKey);
                    if (detected && detected.length > 0) {
                        const validModel = detected.find(m => m === 'llama-3.1-8b-instant')
                            || detected.find(m => m === 'llama-3.3-70b-versatile')
                            || detected.find(m => m.includes('8b'))
                            || detected.find(m => m.includes('llama'))
                            || detected[0];
                        if (validModel && validModel !== cleanModel) {
                            console.log(`Auto-cambiando modelo a "${validModel}" y reintentando petición...`);
                            this.model = validModel;
                            localStorage.setItem('agenda_ai_model', validModel);
                            this._updateStatusLabel();
                            return await this._callOllamaAPI(messages, true);
                        }
                    }
                } catch (detectErr) {
                    console.warn("Fallo en auto-detección de recuperación:", detectErr);
                }
            }

            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        // Extract message from OpenAI format or native Ollama format
        if (data.choices && data.choices[0] && data.choices[0].message) {
            return data.choices[0].message.content;
        } else if (data.message && data.message.content) {
            return data.message.content;
        } else if (typeof data.response === 'string') {
            return data.response;
        } else {
            throw new Error("Respuesta no reconocida del servidor de IA.");
        }
    }

    _extractActionFromText(rawText) {
        if (!rawText) return null;

        // 1. Markdown code block: ```json ... ``` or ```JSON ... ``` or ``` ... ```
        const codeBlockRegex = /```(?:json|JSON)?\s*([\s\S]*?)\s*```/g;
        let match;
        while ((match = codeBlockRegex.exec(rawText)) !== null) {
            const candidate = match[1].trim();
            if (candidate.startsWith('{') && candidate.endsWith('}')) {
                try {
                    const parsed = JSON.parse(candidate);
                    if (parsed.action) return parsed;
                } catch (e) { }
            }
        }

        // 2. Scan for raw JSON object with "action" anywhere in text
        const jsonObjectRegex = /\{[\s\S]*?"action"\s*:\s*"[\s\S]*?\}/g;
        while ((match = jsonObjectRegex.exec(rawText)) !== null) {
            try {
                const startIdx = match.index;
                let braceCount = 0;
                let endIdx = -1;
                for (let i = startIdx; i < rawText.length; i++) {
                    if (rawText[i] === '{') braceCount++;
                    else if (rawText[i] === '}') {
                        braceCount--;
                        if (braceCount === 0) {
                            endIdx = i + 1;
                            break;
                        }
                    }
                }
                if (endIdx > startIdx) {
                    const candidate = rawText.substring(startIdx, endIdx);
                    const parsed = JSON.parse(candidate);
                    if (parsed.action) return parsed;
                }
            } catch (e) { }
        }

        return null;
    }

    _normalizeDate(d, defaultYear = new Date().getFullYear()) {
        if (!d || typeof d !== 'string') return d;
        d = d.trim();
        // YYYY-MM-DD or YYYY-M-D
        const isoMatch = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (isoMatch) {
            return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
        }
        // DD/MM/YYYY or D/M/YYYY
        const slashMatch = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (slashMatch) {
            return `${slashMatch[3]}-${slashMatch[2].padStart(2, '0')}-${slashMatch[1].padStart(2, '0')}`;
        }
        // DD-MM-YYYY
        const dashMatch = d.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
        if (dashMatch) {
            return `${dashMatch[3]}-${dashMatch[2].padStart(2, '0')}-${dashMatch[1].padStart(2, '0')}`;
        }
        return d;
    }

    async _processAssistantResponse(rawText, userPrompt = '') {
        console.log("[AI Assistant] Respuesta cruda del modelo:", rawText);
        let displayText = rawText;
        let action = this._extractActionFromText(rawText);

        if (action) {
            // Remove the raw code block from displayed chat prose
            displayText = rawText.replace(/```(?:json|JSON)?[\s\S]*?```/gi, '').trim();
        }

        const resolveTargetTask = (data, userText) => {
            const allTasks = this.store.getTasks();
            if (!allTasks || allTasks.length === 0) return null;

            // 1. Match by ID
            const targetId = data?.taskId || data?.id || data?.task_id;
            if (targetId) {
                const found = allTasks.find(t => String(t.id).trim() === String(targetId).trim());
                if (found) return found;
            }

            // 2. Match by exact or partial name in action.data
            const dataName = (data?.name || data?.titulo || data?.title || '').toLowerCase().trim();
            if (dataName && !['tarea', 'la tarea', 'esta tarea', 'entrada'].includes(dataName)) {
                let found = allTasks.find(t => (t.name || '').toLowerCase().trim() === dataName);
                if (found) return found;
                found = allTasks.find(t => (t.name || '').toLowerCase().includes(dataName) || dataName.includes((t.name || '').toLowerCase()));
                if (found) return found;
            }

            // 3. Match words in the user prompt or AI response
            const combined = ((userText || '') + ' ' + (rawText || '')).toLowerCase();
            for (const t of allTasks) {
                const tName = (t.name || '').toLowerCase();
                const keywords = tName.split(/[\s,\.\(\)\-]+/).filter(w => w.length > 3);
                if (keywords.some(k => combined.includes(k))) {
                    return t;
                }
            }

            // 4. Fallback to last created / referenced task
            if (this.lastReferencedTaskId) {
                const found = allTasks.find(t => t.id === this.lastReferencedTaskId);
                if (found) return found;
            }

            // 5. If only 1 task in agenda
            if (allTasks.length === 1) {
                return allTasks[0];
            }

            // 6. Most recent task
            return allTasks[allTasks.length - 1];
        };

        // Fallback: If model did not emit JSON, but user clearly asked to delete or modify
        if (!action && userPrompt) {
            const pLower = userPrompt.toLowerCase();
            if (pLower.includes('elimina') || pLower.includes('borra') || pLower.includes('cancela') || pLower.includes('quita')) {
                const t = resolveTargetTask({}, userPrompt);
                if (t) {
                    action = { action: 'delete_task', data: { taskId: t.id, name: t.name } };
                }
            } else if (pLower.includes('cambia') || pLower.includes('modifica') || pLower.includes('pasa') || pLower.includes('mueve')) {
                // Check if user specified dates in prompt
                const t = resolveTargetTask({}, userPrompt);
                if (t) {
                    action = { action: 'update_task', data: { taskId: t.id, name: t.name } };
                }
            }
        }

        let createdTask = null;
        let deletedTask = null;
        let updatedTask = null;

        if (action) {
            const actionType = String(action.action || '').toLowerCase().trim();
            const data = action.data || {};

            // CREATE
            if (actionType.includes('create') || actionType.includes('add') || actionType.includes('añadir')) {
                try {
                    const taskData = {
                        name: data.name || data.titulo || data.title || 'Nueva tarea',
                        description: data.name || data.titulo || data.title || 'Nueva tarea',
                        categoryId: data.categoryId || this.store.getCategories()[0]?.id || '',
                        startDate: this._normalizeDate(data.startDate || data.start_date || data.inicio || data.fechaInicio) || new Date().toISOString().split('T')[0],
                        endDate: this._normalizeDate(data.endDate || data.end_date || data.fin || data.fechaFin || data.startDate || data.inicio) || new Date().toISOString().split('T')[0],
                        time: data.time || data.hora || '',
                        reminder: data.reminder || data.aviso || 'none',
                        amount: (data.amount !== undefined && data.amount !== null) ? Number(data.amount) : null,
                        location: data.location || data.lugar || '',
                        comments: data.comments || data.notas || '',
                        attachments: []
                    };

                    const newId = await this.store.addTask(taskData);
                    createdTask = { id: newId, ...taskData };
                    this.lastReferencedTaskId = newId;

                    if (window._appInstance) {
                        window._appInstance.render();
                    }
                } catch (err) {
                    console.error("Error al crear tarea con IA:", err);
                    displayText += `\n\n⚠️ Error al guardar la entrada: ${err.message}`;
                }

            // DELETE
            } else if (actionType.includes('delete') || actionType.includes('remove') || actionType.includes('borrar') || actionType.includes('cancel')) {
                try {
                    const targetTask = resolveTargetTask(data, userPrompt);
                    if (targetTask) {
                        await this.store.deleteTask(targetTask.id);
                        deletedTask = targetTask;
                        if (this.lastReferencedTaskId === targetTask.id) {
                            this.lastReferencedTaskId = null;
                        }
                        if (window._appInstance) {
                            window._appInstance.render();
                        }
                    } else {
                        displayText += `\n\n⚠️ No se encontró en el calendario la entrada para eliminar.`;
                    }
                } catch (err) {
                    console.error("Error al eliminar tarea con IA:", err);
                    displayText += `\n\n⚠️ Error al eliminar la entrada: ${err.message}`;
                }

            // UPDATE
            } else if (actionType.includes('update') || actionType.includes('modify') || actionType.includes('edit') || actionType.includes('cambiar')) {
                try {
                    const targetTask = resolveTargetTask(data, userPrompt);
                    if (targetTask) {
                        const updateData = {};
                        if (data.name || data.titulo || data.title) updateData.name = data.name || data.titulo || data.title;
                        const sDate = this._normalizeDate(data.startDate || data.start_date || data.inicio || data.fechaInicio || data.fecha);
                        const eDate = this._normalizeDate(data.endDate || data.end_date || data.fin || data.fechaFin);
                        if (sDate) updateData.startDate = sDate;
                        if (eDate) updateData.endDate = eDate;
                        else if (sDate && !targetTask.endDate) updateData.endDate = sDate;
                        if (data.time !== undefined) updateData.time = data.time;
                        if (data.amount !== undefined) updateData.amount = Number(data.amount);
                        if (data.location !== undefined) updateData.location = data.location;
                        if (data.comments !== undefined) updateData.comments = data.comments;
                        if (data.categoryId) updateData.categoryId = data.categoryId;

                        await this.store.updateTask(targetTask.id, updateData);
                        updatedTask = { ...targetTask, ...updateData };
                        this.lastReferencedTaskId = targetTask.id;

                        if (window._appInstance) {
                            window._appInstance.render();
                        }
                    } else {
                        displayText += `\n\n⚠️ No se encontró la entrada para modificar en el calendario.`;
                    }
                } catch (err) {
                    console.error("Error al actualizar tarea con IA:", err);
                    displayText += `\n\n⚠️ Error al actualizar la entrada: ${err.message}`;
                }
            }
        }

        this.renderMessage({
            role: 'assistant',
            text: displayText,
            createdTask,
            deletedTask,
            updatedTask
        });
    }

    renderMessage({ role, text, isError = false, createdTask = null, deletedTask = null, updatedTask = null }) {
        this.messages.push({ role, text });

        if (!this.messagesContainer) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = `ai-message ${role} ${isError ? 'error' : ''}`;

        const bubble = document.createElement('div');
        bubble.className = 'ai-message-bubble';

        // Format basic Markdown bold and line breaks
        let formatted = this._escapeHtml(text)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');

        bubble.innerHTML = formatted;

        // Confirmation card: Created Task
        if (createdTask) {
            const category = this.store.getCategories().find(c => c.id === createdTask.categoryId);
            const card = document.createElement('div');
            card.className = 'ai-action-card';

            let extraInfo = '';
            if (createdTask.amount) extraInfo += ` 💶 <strong>${Number(createdTask.amount).toFixed(2)}€</strong>`;
            if (createdTask.time) extraInfo += ` ⏰ ${createdTask.time}`;
            if (createdTask.reminder && createdTask.reminder !== 'none') extraInfo += ` 🔔`;

            card.innerHTML = `
                <div class="ai-action-card-header">
                    <span class="ai-action-badge" style="background:${category ? category.color : '#3b82f6'};">
                        ${category ? category.name : 'Entrada'}
                    </span>
                    <span class="ai-action-dates">📅 ${createdTask.startDate}</span>
                </div>
                <div class="ai-action-title">✅ ${createdTask.name}${extraInfo}</div>
            `;
            bubble.appendChild(card);
        }

        // Confirmation card: Deleted Task
        if (deletedTask) {
            const card = document.createElement('div');
            card.className = 'ai-action-card ai-action-card-deleted';
            card.innerHTML = `
                <div class="ai-action-card-header">
                    <span class="ai-action-badge" style="background: #dc2626;">🗑️ Entrada Eliminada</span>
                    <span class="ai-action-dates">📅 ${deletedTask.startDate}</span>
                </div>
                <div class="ai-action-title" style="color: #991b1b; text-decoration: line-through;">${deletedTask.name}</div>
            `;
            bubble.appendChild(card);
        }

        // Confirmation card: Updated Task
        if (updatedTask) {
            const card = document.createElement('div');
            card.className = 'ai-action-card ai-action-card-updated';
            let extraInfo = '';
            if (updatedTask.amount) extraInfo += ` 💶 <strong>${Number(updatedTask.amount).toFixed(2)}€</strong>`;
            card.innerHTML = `
                <div class="ai-action-card-header">
                    <span class="ai-action-badge" style="background: #2563eb;">✏️ Entrada Modificada</span>
                    <span class="ai-action-dates">📅 ${updatedTask.startDate}</span>
                </div>
                <div class="ai-action-title" style="color: #1e40af;">🔄 ${updatedTask.name}${extraInfo}</div>
            `;
            bubble.appendChild(card);
        }

        msgDiv.appendChild(bubble);
        this.messagesContainer.appendChild(msgDiv);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    _escapeHtml(str) {
        if (!str) return '';
        const p = document.createElement('p');
        p.textContent = str;
        return p.innerHTML;
    }

    _setLoading(loading) {
        if (this.statusIndicator) {
            this.statusIndicator.style.display = loading ? 'flex' : 'none';
        }
        if (this.btnSend) {
            this.btnSend.disabled = loading;
        }
        if (this.messagesContainer) {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }
}

window.AIAssistant = AIAssistant;
