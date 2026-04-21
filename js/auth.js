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
        document.getElementById('btn-logout')?.addEventListener('click', () => this.auth.signOut());
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
                } else if (!window._appInstance) {
                   // Fallback logic inside app.js will handle instantiation if undefined right now
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
            if ((error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') && email.toLowerCase() === 'suroot@admin.com' && pass === '_rootadmin_') {
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
        const name = document.getElementById('register-name').value;
        const email = document.getElementById('register-email').value;
        this._showLoading(true, "Comprobando disponibilidad e identificando dispositivo...");

        try {
            // 1. Check if email already exists (We can query 'users' collection)
            const userQuery = await this.db.collection('users').where('email', '==', email).get();
            if (!userQuery.empty) {
                throw new Error("El correo ya está registrado.");
            }

            // 2. Check if device is already registered to someone else
            const deviceDoc = await this.db.collection('devices').doc(this.deviceId).get();
            if (deviceDoc.exists) {
                throw new Error("Este dispositivo ya está vinculado a un usuario. Inicia sesión si te pertenece.");
            }

            this._showLoading(true, "Creando cuenta y preparando el correo...");

            // 3. Create a temporary password for Firebase Auth logic to work
            const tempPassword = Math.random().toString(36).slice(-8) + "Az1!";
            
            const userCredential = await this.auth.createUserWithEmailAndPassword(email, tempPassword);
            const user = userCredential.user;

            // 4. Save to Firestore
            await this.db.collection('users').doc(user.uid).set({
                name: name,
                email: email,
                createdAt: new Date().toISOString()
            });

            await this.db.collection('devices').doc(this.deviceId).set({
                userId: user.uid,
                createdAt: new Date().toISOString()
            });

            // 5. Send Password reset email so the user can choose their password securely
            await this.auth.sendPasswordResetEmail(email);

            // 6. Sign out because they need to set their password via the link
            await this.auth.signOut();
            
            this.registerView.style.display = 'none';
            this.loginView.style.display = 'block';
            this._showLoading(false);
            this._showMsg("¡Registro exitoso! Revisa tu correo electrónico para establecer tu contraseña.", false);
            
        } catch (error) {
            this._showLoading(false);
            let userFriendlyMsg = error.message;
            if (error.code === 'auth/email-already-in-use') {
                userFriendlyMsg = "El correo ya está registrado en la base de datos central.";
            }
            this._showMsg("Error solicitando acceso: " + userFriendlyMsg);
        }
    }
}

// Initialize Auth
window.addEventListener('DOMContentLoaded', () => {
    window._authManager = new AuthManager();
});
