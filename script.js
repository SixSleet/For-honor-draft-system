import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";

import { 
    getFirestore,
    collection,
    doc,
    setDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";



const firebaseConfig = {
  apiKey: "AIzaSyAlfHktNixGilZKJ58TpMQ0logjFIvfLdA",
  authDomain: "for-honor-draft-picker.firebaseapp.com",
  projectId: "for-honor-draft-picker",
  storageBucket: "for-honor-draft-picker.firebasestorage.app",
  messagingSenderId: "386154404087",
  appId: "1:386154404087:web:1ebbce1a03521bcbc89bf2"
};



const app = initializeApp(firebaseConfig);

const db = getFirestore(app);



const createButton = document.getElementById("createLobby");
const joinButton = document.getElementById("joinLobby");



function generateCode(){

    return Math.random()
    .toString(36)
    .substring(2,8)
    .toUpperCase();

}



createButton.onclick = async()=>{


    let name =
    document.getElementById("playerName").value;


    let code = generateCode();


    await setDoc(
        doc(db,"lobbies",code),
        {
            created:true
        }
    );


    await setDoc(
        doc(db,"lobbies",code,"players",name),
        {
            name:name
        }
    );


    document.getElementById("codeDisplay").innerHTML =
    "Lobby code: " + code;


    listenPlayers(code);


};



joinButton.onclick = async()=>{


    let name =
    document.getElementById("playerName").value;


    let code =
    document.getElementById("lobbyCode").value;


    await setDoc(
        doc(db,"lobbies",code,"players",name),
        {
            name:name
        }
    );


    listenPlayers(code);

};



function listenPlayers(code){


    const players =
    collection(db,"lobbies",code,"players");


    onSnapshot(players,(snapshot)=>{


        let list="";


        snapshot.forEach(player=>{

            list += 
            `<li>${player.data().name}</li>`;

        });


        document.getElementById("players")
        .innerHTML=list;


    });


}