// js/admin.js

class AdminManager {
    constructor() {
        this.db = firebase.firestore();
        this._bindUI();
    }

    _bindUI() {
        this.btnSu = document.getElementById('btn-su');
        this.modal = document.getElementById('modal-su-admin');
        this.btnClose = document.getElementById('btn-close-su');
        this.listBody = document.getElementById('su-users-list');

        if (this.btnSu) {
            this.btnSu.addEventListener('click', () => {
                this.modal.style.display = 'flex';
                this.loadUsers();
            });
        }

        if (this.btnClose) {
            this.btnClose.addEventListener('click', () => {
                this.modal.style.display = 'none';
            });
        }
    }

    async loadUsers() {
        this.listBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Cargando usuarios...</td></tr>';
        try {
            // Get all devices to map them to users
            const devicesQuery = await this.db.collection('devices').get();
            const userDevices = {};
            
            devicesQuery.forEach(doc => {
                const data = doc.data();
                if (!userDevices[data.userId]) {
                    userDevices[data.userId] = [];
                }
                userDevices[data.userId].push(doc.id); // deviceId
            });

            // Get all users
            const usersQuery = await this.db.collection('users').get();
            this.listBody.innerHTML = '';

            usersQuery.forEach(doc => {
                const user = doc.data();
                const uid = doc.id;
                
                const tr = document.createElement('tr');
                
                // Devices String
                const devices = userDevices[uid] || [];
                const devicesStr = devices.length > 0 ? devices.join(', ') : 'Ninguno';

                // Ensure SU root can't be deleted from UI
                const isSuRoot = user.email.toLowerCase() === 'suroot@admin.com';
                const actionBtn = isSuRoot 
                    ? '<span style="color:var(--text-muted); font-size: 0.8rem;">Protegido</span>'
                    : `<button class="btn btn-sm-danger" data-uid="${uid}">Eliminar</button>`;

                tr.innerHTML = `
                    <td><strong>${user.name || 'Sin Nombre'}</strong></td>
                    <td>${user.email}</td>
                    <td><span style="font-size: 0.8em; color: var(--text-muted);">${devicesStr}</span></td>
                    <td>${actionBtn}</td>
                `;

                this.listBody.appendChild(tr);

                // Add delete listener
                if (!isSuRoot) {
                    const btn = tr.querySelector('button');
                    if (btn) {
                        btn.addEventListener('click', () => this.deleteUser(uid, user.name, devices));
                    }
                }
            });

            if (usersQuery.empty) {
                this.listBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No hay usuarios registrados.</td></tr>';
            }

        } catch (error) {
            console.error("Error cargando usuarios: ", error);
            this.listBody.innerHTML = `<tr><td colspan="4" style="color: red; text-align: center;">Error de permisos o conexión. Revisa las reglas de Firestore.</td></tr>`;
        }
    }

    async deleteUser(uid, name, deviceIds) {
        if (!confirm(`¿Estás seguro de eliminar el perfil y acceso de "${name}"? Perderá el acceso de forma permanente.`)) {
            return;
        }

        try {
            // Delete device mappings first
            for (const deviceId of deviceIds) {
                await this.db.collection('devices').doc(deviceId).delete();
            }
            
            // Delete user doc
            await this.db.collection('users').doc(uid).delete();
            
            alert(`Usuario ${name} eliminado correctamente de la base de datos.`);
            this.loadUsers(); // Refresh list

        } catch (error) {
            console.error("Error eliminando usuario: ", error);
            alert("Hubo un error al eliminar el usuario. Comprueba los permisos de Firestore.");
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    // Wait slightly to ensure Firebase fires up Auth
    setTimeout(() => {
        if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
            window._adminManager = new AdminManager();
        }
    }, 500);
});
