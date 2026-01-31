// js/firebaseConfig.js
// Archivo de configuración manual de Firebase.
// Sustituye a /__/firebase/init.js para hosting externo (Netlify, Vercel, Localhost).

// Pega aquí tu objeto de configuración de Firebase.
// Lo puedes obtener en la consola de Firebase: Project Settings -> General -> Your Apps -> SDK Setup and Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCClasJEjf0nv3HPHSxGoOU3i5MWZOpsmA",
    authDomain: "calendario-proyectos-8da3b.firebaseapp.com",
    projectId: "calendario-proyectos-8da3b",
    storageBucket: "calendario-proyectos-8da3b.firebasestorage.app",
    messagingSenderId: "809263181415",
    appId: "1:809263181415:web:5e31076071556330396ec2"
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
