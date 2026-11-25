// js/firebaseConfig.js
// Archivo de configuración manual de Firebase.
// Sustituye a /__/firebase/init.js para hosting externo (Netlify, Vercel, Localhost).

// Pega aquí tu objeto de configuración de Firebase.
// Lo puedes obtener en la consola de Firebase: Project Settings -> General -> Your Apps -> SDK Setup and Configuration
const firebaseConfig = {
    apiKey: "AIzaSyC1gIxY57o9kwZjZBnDVL7qgcvolmz-yr0",
    authDomain: "personalcalendar-741d7.firebaseapp.com",
    projectId: "personalcalendar-741d7",
    storageBucket: "personalcalendar-741d7.firebasestorage.app",
    messagingSenderId: "92487128494",
    appId: "1:92487128494:web:d8f174bf7661ad9732a43f",
    measurementId: "G-1W16Z5ZMLY"
};

// Inicializar Firebase
if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
        try {
            firebase.initializeApp(firebaseConfig);
            console.log("Firebase inicializado manualmente desde firebaseConfig.js");
        } catch (error) {
            console.error("Error inicializando Firebase:", error);
            alert("Error inicializando Firebase. Revisa la consola y tu configuración en js/firebaseConfig.js");
        }
    }
} else {
    console.error("La librería de Firebase no está cargada antes de este script.");
}
