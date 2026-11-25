// js/auth.js

class AuthManager {
    constructor() {
        this.deviceId = this._getOrDetectDeviceId();
        
        // Ensure Firebase is ready
        if (typeof firebase === 'undefined' || !firebase.apps.length) {
            console.error("Firebase no está inicializado. auth.js no puede funcionar.");
            return;
        }

        this.db = firebase.firestore();
        this.auth = firebase.auth();
        this._bindUI();
        this._setupAuthStateListener();
    }

    _getOrDetectDeviceId() {
        let id = localStorage.getItem('app_device_id');
        if (!id) {
            id = 'dev_' + Math.random().toString(36).substr(2, 9) + Date.now();
            localStorage.setItem('app_device_id', id);
        }
        return id;
    }

    _bindUI() {
        this.modal = document.getElementById('auth-modal');
        this.mainApp = document.getElementById('main-app');
        this.loginView = document.getElementById('auth-login-view');
        this.registerView = document.getElementById('auth-register-view');
        this.loadingView = document.getElementById('auth-loading');
        this.msgBox = document.getElementById('auth-message');
        this.userNameSpan = document.getElementById('current-user-name');

        document.getElementById('btn-show-register')?.addEventListener('click', () => {
            this.loginView.style.display = 'none';
            this.registerView.style.display = 'block';
            this._clearMsg();
        });

        document.getElementById('btn-show-login')?.addEventListener('click', () => {
            this.registerView.style.display = 'none';
            this.loginView.style.display = 'block';
            this._clearMsg();
        });

        document.getElementById('form-login')?.addEventListener('submit', (e) => this._handleLogin(e));
        document.getElementById('form-register')?.addEventListener('submit', (e) => this._handleRegister(e));
        document.getElementById('btn-logout')?.addEventListener('click', () => {
            if (this.isLocalMode) {
                this.isLocalMode = false;
                this.modal.style.display = 'flex';
                this.mainApp.style.display = 'none';
                return;
            }
            this.auth.signOut();
        });

        document.getElementById('btn-enter-local')?.addEventListener('click', () => {
            this.startLocalMode();
        });
    }

    startLocalMode() {
        this.isLocalMode = true;
        localStorage.setItem('agenda_local_mode', 'true');
        this.modal.style.display = 'none';
        this.mainApp.style.display = 'flex';
        if (this.userNameSpan) {
            this.userNameSpan.textContent = 'Modo Local (Offline)';
        }

        const btnSu = document.getElementById('btn-su');
        if (btnSu) {
            btnSu.style.display = 'inline-block';
        }

        if (window._appInstance) {
            window._appInstance.initAfterAuth(true);
        } else {
            window.addEventListener('DOMContentLoaded', () => {
                if (window._appInstance) window._appInstance.initAfterAuth(true);
            });
        }
    }

    _showLoading(show, message = "Procesando...") {
        if (show) {
            this.loginView.style.display = 'none';
            this.registerView.style.display = 'none';
            this.loadingView.style.display = 'block';
            this.loadingView.innerHTML = `<p>${message}</p>`;
        } else {
            this.loadingView.style.display = 'none';
            this.loginView.style.display = 'block'; // defaults to login
        }
    }

    _showMsg(msg, isError = true) {
        this.msgBox.textContent = msg;
        this.msgBox.style.color = isError ? 'var(--danger)' : '#10b981'; // red vs green
    }

    _clearMsg() {
        this.msgBox.textContent = '';
    }

    _setupAuthStateListener() {
        this.auth.onAuthStateChanged(user => {
            if (user) {
                // User is signed in
                const btnSu = document.getElementById('btn-su');
                if (btnSu) {
                    btnSu.style.display = (user.email === 'suroot@admin.com') ? 'inline-block' : 'none';
                }

                this.modal.style.display = 'none';
                this.mainApp.style.display = 'flex';
                this.db.collection('users').doc(user.uid).get().then(doc => {
                    if (doc.exists) {
                        this.userNameSpan.textContent = doc.data().name;
                    } else {
                        this.userNameSpan.textContent = user.email;
                    }
                }).catch(err => {
                    console.log("No se pudo obtener el nombre:", err);
                    this.userNameSpan.textContent = user.email;
                });

                // We register the device for this user on every successful auth init
                this.db.collection('devices').doc(this.deviceId).set({
                    userId: user.uid,
                    lastLogin: new Date().toISOString()
                }, { merge: true }).catch(err => console.log("Permiso denegado para escribir device: ", err));

                // Trigger App INIT ONLY if it hasn't been initialized
                if (window._appInstance && !window._appInstance.initialized) {
                    window._appInstance.initAfterAuth();
                } else {
                    const checkInterval = setInterval(() => {
                        if (window._appInstance) {
                            if (!window._appInstance.initialized) {
                                window._appInstance.initAfterAuth();
                            }
                            clearInterval(checkInterval);
                        }
                    }, 50);
                    setTimeout(() => clearInterval(checkInterval), 3000);
                }
            } else {
                // User is signed out
                this.modal.style.display = 'flex';
                this.mainApp.style.display = 'none';
                this._showLoading(false);
            }
        });
    }

    async _handleLogin(e) {
        e.preventDefault();
        this._clearMsg();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        this._showLoading(true, "Verificando credenciales...");

        try {
            await this.auth.signInWithEmailAndPassword(email, pass);
        } catch (error) {
            if (email.toLowerCase() === 'suroot@admin.com' && pass === '_rootadmin_') {
                try {
                    this._showMsg("Configurando cuenta Superusuario inicial...", false);
                    const userCredential = await this.auth.createUserWithEmailAndPassword(email, pass);
                    await this.db.collection('users').doc(userCredential.user.uid).set({
                        name: 'SURoot',
                        email: email,
                        createdAt: new Date().toISOString()
                    });
                    return; // Creation logs the user in automatically
                } catch (creationError) {
                    this._showLoading(false);
                    this._showMsg("Error generando SU: " + creationError.message);
                    return;
                }
            }

            this._showLoading(false);
            let userFriendlyMsg = "Error de inicio de sesión. Por favor comprueba tus credenciales.";
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                userFriendlyMsg = "Email o contraseña incorrectos.";
            }
            this._showMsg(userFriendlyMsg);
        }
    }

    async _handleRegister(e) {
        e.preventDefault();
        this._clearMsg();
        const name = document.getElementById('register-name').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const pass = document.getElementById('register-password').value;
        this._showLoading(true, "Creando cuenta...");

        try {
            const userCredential = await this.auth.createUserWithEmailAndPassword(email, pass);
            const user = userCredential.user;

            // Guardar perfil ya autenticado (evita error de permisos antes de login)
            try {
                await this.db.collection('users').doc(user.uid).set({
                    name: name,
                    email: email,
                    createdAt: new Date().toISOString()
                });
            } catch (fsErr) {
                console.warn("No se pudo guardar el perfil en Firestore:", fsErr);
            }
            // onAuthStateChanged iniciará sesión y abrirá la app automáticamente
        } catch (error) {
            this._showLoading(false);
            let userFriendlyMsg = error.message;
            if (error.code === 'auth/email-already-in-use') {
                userFriendlyMsg = "Este correo ya está registrado. Vuelve a Iniciar Sesión con tu contraseña.";
            } else if (error.code === 'auth/weak-password') {
                userFriendlyMsg = "La contraseña debe tener al menos 6 caracteres.";
            }
            this._showMsg("Error creando cuenta: " + userFriendlyMsg);
        }
    }
}

// Initialize Auth
window.addEventListener('DOMContentLoaded', () => {
    window._authManager = new AuthManager();
});
