import { initializeApp } from 
"https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";


import {

getFirestore,
doc,
setDoc,
getDoc,
getDocs,
collection,
onSnapshot,
updateDoc,
deleteDoc,
Timestamp

}

from

"https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";



const firebaseConfig = {

apiKey: "AIzaSyAlfHktNixGilZKJ58TpMQ0logjFIvfLdA",

authDomain: "for-honor-draft-picker.firebaseapp.com",

projectId: "for-honor-draft-picker",

storageBucket: "for-honor-draft-picker.firebasestorage.app",

messagingSenderId: "386154404087",

appId: "1:386154404087:web:1ebbce1a03521bcbc89bf2"

};



const app = initializeApp(firebaseConfig);



export const db = getFirestore(app);



export {

doc,
setDoc,
getDoc,
getDocs,
collection,
onSnapshot,
updateDoc,
deleteDoc,
Timestamp

};