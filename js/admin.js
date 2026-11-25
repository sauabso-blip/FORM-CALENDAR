// js/admin.js

class AdminManager {
    constructor() {
        this.db = (typeof firebase !== 'undefined' && firebase.firestore) ? firebase.firestore() : null;
        this._bindUI();
    }

    _bindUI() {
        this.btnSu = document.getElementById('btn-su');
        this.modal = document.getElementById('modal-su-admin');
        this.btnClose = document.getElementById('btn-close-su');
        this.listBody = document.getElementById('su-users-list');

        this.formCreate = document.getElementById('su-form-create-user');
        this.inputName = document.getElementById('su-new-user-name');
        this.inputEmail = document.getElementById('su-new-user-email');
        this.inputPass = document.getElementById('su-new-user-password');
        this.msgCreate = document.getElementById('su-create-user-msg');
        this.btnSubmitCreate = document.getElementById('su-btn-create-user');

        if (this.btnSu) {
            this.btnSu.addEventListener('click', () => {
                if (this.modal) this.modal.style.display = 'flex';
                this.loadUsers();
            });
        }

        if (this.btnClose) {
            this.btnClose.addEventListener('click', () => {
                if (this.modal) this.modal.style.display = 'none';
            });
        }

        if (this.formCreate) {
            this.formCreate.addEventListener('submit', (e) => this._handleCreateUser(e));
        }
    }

    _showCreateMsg(msg, isSuccess = true) {
        if (!this.msgCreate) return;
        this.msgCreate.textContent = msg;
        this.msgCreate.style.display = 'block';
        this.msgCreate.style.color = isSuccess ? '#16a34a' : '#dc2626';
    }

    _clearCreateMsg() {
        if (this.msgCreate) {
            this.msgCreate.textContent = '';
            this.msgCreate.style.display = 'none';
        }
    }

    async _handleCreateUser(e) {
        e.preventDefault();
        this._clearCreateMsg();

        const name = (this.inputName?.value || '').trim();
        const email = (this.inputEmail?.value || '').trim().toLowerCase();
        const pass = this.inputPass?.value || '';

        if (!name || !email) {
            this._showCreateMsg("Por favor, completa el nombre y el correo electrónico.", false);
            return;
        }

        if (this.btnSubmitCreate) {
            this.btnSubmitCreate.disabled = true;
            this.btnSubmitCreate.textContent = "Procesando...";
        }

        try {
            const res = await this.createUser(name, email, pass);
            if (res.alreadyExistedInAuth) {
                this._showCreateMsg(`ℹ️ El correo "${email}" ya existía en Firebase Auth. Se ha vinculado e incorporado con éxito al panel con el nombre "${name}".`, true);
            } else {
                this._showCreateMsg(`✅ Usuario "${name}" (${email}) generado con éxito. Ya puede iniciar sesión.`, true);
            }
            this.formCreate.reset();
            await this.loadUsers();
        } catch (err) {
            console.error("Error al generar usuario:", err);
            this._showCreateMsg(`⚠️ Error: ${err.message || err}`, false);
        } finally {
            if (this.btnSubmitCreate) {
                this.btnSubmitCreate.disabled = false;
                this.btnSubmitCreate.textContent = "Crear Usuario";
            }
        }
    }

    async createUser(name, email, password) {
        name = name.trim();
        email = email.trim().toLowerCase();

        // 1. Firebase Auth vía secondary app instance
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0 && firebase.auth) {
            const appOptions = firebase.app().options;
            const tempAppName = 'SecondaryAuthAdmin_' + Date.now();
            let secondaryApp = null;
            let newUid = null;
            let alreadyExistedInAuth = false;

            if (password && password.length >= 6) {
                try {
                    secondaryApp = firebase.initializeApp(appOptions, tempAppName);
                    const secondaryAuth = secondaryApp.auth();
                    const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
                    newUid = cred.user.uid;
                    await secondaryAuth.signOut();
                } catch (authErr) {
                    if (authErr.code === 'auth/email-already-in-use') {
                        // El correo ya está registrado en Firebase: lo sincronizamos al panel
                        alreadyExistedInAuth = true;
                    } else if (authErr.code === 'auth/invalid-email') {
                        throw new Error("El formato del correo electrónico no es válido.");
                    } else if (authErr.code === 'auth/weak-password') {
                        throw new Error("La contraseña debe tener al menos 6 caracteres.");
                    } else {
                        throw authErr;
                    }
                } finally {
                    if (secondaryApp) {
                        try { await secondaryApp.delete(); } catch (delErr) { console.warn(delErr); }
                    }
                }
            } else if (!password) {
                // Si no se introduce contraseña, asumimos que se quiere sincronizar un usuario existente
                alreadyExistedInAuth = true;
            } else if (password.length < 6) {
                throw new Error("La contraseña debe tener como mínimo 6 caracteres.");
            }

            // 2. Guardar o vincular perfil en colección 'users' de Firestore
            let finalUid = newUid || ('user_' + email.replace(/[^a-zA-Z0-9]/g, '_'));

            if (this.db) {
                try {
                    // Verificar si ya existe doc por email
                    const existingQuery = await this.db.collection('users').where('email', '==', email).limit(1).get();
                    if (!existingQuery.empty) {
                        finalUid = existingQuery.docs[0].id;
                        await this.db.collection('users').doc(finalUid).set({
                            name: name,
                            email: email,
                            updatedAt: new Date().toISOString()
                        }, { merge: true });
                    } else {
                        await this.db.collection('users').doc(finalUid).set({
                            name: name,
                            email: email,
                            createdAt: new Date().toISOString(),
                            createdBy: 'suroot@admin.com',
                            syncedFromAuth: alreadyExistedInAuth
                        }, { merge: true });
                    }
                } catch (fsErr) {
                    console.warn("No se pudo escribir en Firestore users:", fsErr);
                }
            }

            // Guardar también en localStorage para consistencia offline
            const localUsers = JSON.parse(localStorage.getItem('agenda_local_users') || '[]');
            const idx = localUsers.findIndex(u => (u.email || '').toLowerCase() === email);
            if (idx >= 0) {
                localUsers[idx].name = name;
                localUsers[idx].id = finalUid;
            } else {
                localUsers.push({ id: finalUid, name: name, email: email, createdAt: new Date().toISOString() });
            }
            localStorage.setItem('agenda_local_users', JSON.stringify(localUsers));

            return { uid: finalUid, name, email, alreadyExistedInAuth };
        } else {
            // Modo local / offline
            const newUid = 'local_user_' + Date.now();
            const localUsers = JSON.parse(localStorage.getItem('agenda_local_users') || '[]');
            localUsers.push({ id: newUid, name, email, createdAt: new Date().toISOString() });
            localStorage.setItem('agenda_local_users', JSON.stringify(localUsers));
            return { uid: newUid, name, email, alreadyExistedInAuth: false };
        }
    }

    async loadUsers() {
        if (!this.listBody) return;
        this.listBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 12px;">Cargando usuarios...</td></tr>';
        
        try {
            const userDevices = {};
            if (this.db) {
                try {
                    const devicesQuery = await this.db.collection('devices').get();
                    devicesQuery.forEach(doc => {
                        const data = doc.data();
                        if (!userDevices[data.userId]) userDevices[data.userId] = [];
                        userDevices[data.userId].push(doc.id);
                    });
                } catch (devErr) {
                    console.log("No se pudieron cargar dispositivos:", devErr);
                }
            }

            let usersList = [];
            if (this.db) {
                try {
                    const usersQuery = await this.db.collection('users').get();
                    usersQuery.forEach(doc => {
                        usersList.push({ uid: doc.id, ...doc.data() });
                    });
                } catch (uErr) {
                    console.warn("Fallo leyendo users de Firestore:", uErr);
                }
            }

            // Unir con usuarios locales si los hay
            const localUsers = JSON.parse(localStorage.getItem('agenda_local_users') || '[]');
            localUsers.forEach(lu => {
                if (!usersList.some(u => (u.email || '').toLowerCase() === (lu.email || '').toLowerCase())) {
                    usersList.push({ uid: lu.id, ...lu });
                }
            });

            // Asegurar que suroot@admin.com siempre aparezca al inicio si no estaba
            if (!usersList.some(u => (u.email || '').toLowerCase() === 'suroot@admin.com')) {
                usersList.unshift({
                    uid: 'suroot_admin',
                    name: 'Superusuario (SURoot)',
                    email: 'suroot@admin.com',
                    createdAt: new Date().toISOString()
                });
            }

            this.listBody.innerHTML = '';

            if (usersList.length === 0) {
                this.listBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 12px; color: var(--text-muted);">No hay usuarios registrados todavía. Crea uno arriba.</td></tr>';
                return;
            }

            usersList.forEach(user => {
                const uid = user.uid;
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid var(--border)';

                const devices = userDevices[uid] || [];
                const devicesStr = devices.length > 0 ? devices.join(', ') : 'Ninguno';

                const isSuRoot = (user.email || '').toLowerCase() === 'suroot@admin.com';
                const actionBtn = isSuRoot 
                    ? '<span style="color:var(--text-muted); font-size: 0.8rem; font-weight: 600;">👑 Superusuario</span>'
                    : `
                        <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                            <button type="button" class="btn btn-sm btn-edit-user" data-uid="${uid}" data-name="${user.name || ''}" data-email="${user.email || ''}" style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; padding: 0.25rem 0.55rem; border-radius: 4px; cursor: pointer; font-size: 0.78rem;" title="Modificar nombre">✏️ Modificar</button>
                            <button type="button" class="btn btn-sm btn-reset-pass" data-email="${user.email || ''}" style="background: #fef3c7; color: #b45309; border: 1px solid #fde68a; padding: 0.25rem 0.55rem; border-radius: 4px; cursor: pointer; font-size: 0.78rem;" title="Enviar correo para restablecer contraseña">🔑 Contraseña</button>
                            <button type="button" class="btn btn-sm-danger btn-delete-user" data-uid="${uid}" style="background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; padding: 0.25rem 0.55rem; border-radius: 4px; cursor: pointer; font-size: 0.78rem;" title="Eliminar usuario del panel">🗑️ Eliminar</button>
                        </div>
                    `;

                tr.innerHTML = `
                    <td style="padding: 10px 8px;"><strong>${user.name || 'Sin Nombre'}</strong></td>
                    <td style="padding: 10px 8px;">${user.email || '—'}</td>
                    <td style="padding: 10px 8px;"><span style="font-size: 0.8em; color: var(--text-muted);">${devicesStr}</span></td>
                    <td style="padding: 10px 8px;">${actionBtn}</td>
                `;

                this.listBody.appendChild(tr);

                if (!isSuRoot) {
                    const btnEdit = tr.querySelector('.btn-edit-user');
                    if (btnEdit) {
                        btnEdit.addEventListener('click', () => {
                            const newName = prompt(`Modificar nombre para ${user.email}:`, user.name || '');
                            if (newName !== null && newName.trim() !== '') {
                                this.updateUserName(uid, newName.trim(), user.email);
                            }
                        });
                    }

                    const btnReset = tr.querySelector('.btn-reset-pass');
                    if (btnReset) {
                        btnReset.addEventListener('click', () => {
                            if (confirm(`¿Enviar un correo a "${user.email}" con el enlace oficial de Firebase para cambiar o restablecer su contraseña?`)) {
                                this.sendPasswordReset(user.email);
                            }
                        });
                    }

                    const btnDel = tr.querySelector('.btn-delete-user');
                    if (btnDel) {
                        btnDel.addEventListener('click', () => this.deleteUser(uid, user.name || user.email, devices));
                    }
                }
            });

        } catch (error) {
            console.error("Error cargando usuarios: ", error);
            this.listBody.innerHTML = `<tr><td colspan="4" style="color: #dc2626; text-align: center; padding: 12px;">Error al cargar lista de usuarios. Revisa la consola.</td></tr>`;
        }
    }

    async updateUserName(uid, newName, email) {
        try {
            if (this.db) {
                await this.db.collection('users').doc(uid).set({
                    name: newName,
                    updatedAt: new Date().toISOString()
                }, { merge: true });
            }
            const localUsers = JSON.parse(localStorage.getItem('agenda_local_users') || '[]');
            const u = localUsers.find(x => x.id === uid || (x.email && x.email.toLowerCase() === email.toLowerCase()));
            if (u) u.name = newName;
            localStorage.setItem('agenda_local_users', JSON.stringify(localUsers));

            alert(`Nombre actualizado a "${newName}".`);
            this.loadUsers();
        } catch (err) {
            console.error("Error actualizando usuario:", err);
            alert("No se pudo actualizar el nombre: " + (err.message || err));
        }
    }

    async sendPasswordReset(email) {
        if (!email) return;
        try {
            if (typeof firebase !== 'undefined' && firebase.auth) {
                await firebase.auth().sendPasswordResetEmail(email);
                alert(`✅ Correo enviado con éxito a "${email}".\n\nEl usuario recibirá un enlace oficial para elegir o restablecer su contraseña.`);
            } else {
                alert(`En modo local no se envían correos. Configura Firebase en la nube.`);
            }
        } catch (err) {
            console.error("Error enviando email de restablecimiento:", err);
            alert("Error de Firebase: " + (err.message || err));
        }
    }

    async deleteUser(uid, name, deviceIds = []) {
        if (!confirm(`¿Estás seguro de eliminar el perfil y acceso de "${name}"? Perderá el acceso de forma permanente.`)) {
            return;
        }

        try {
            if (this.db) {
                for (const deviceId of deviceIds) {
                    try { await this.db.collection('devices').doc(deviceId).delete(); } catch(e) {}
                }
                try { await this.db.collection('users').doc(uid).delete(); } catch(e) {}
            }

            // También eliminar de locales
            const localUsers = JSON.parse(localStorage.getItem('agenda_local_users') || '[]');
            const filtered = localUsers.filter(u => u.id !== uid && u.email !== name);
            localStorage.setItem('agenda_local_users', JSON.stringify(filtered));

            alert(`Usuario "${name}" eliminado correctamente del panel.`);
            this.loadUsers();

        } catch (error) {
            console.error("Error eliminando usuario: ", error);
            alert("Hubo un error al eliminar el usuario. Comprueba los permisos de Firestore.");
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window._adminManager = new AdminManager();
    }, 400);
});
