var firebase = require("firebase/app");
require("firebase/database");
var firebaseConfig = {
    apiKey: "AIzaSyCXX0VC1lX7UlLs2qAjhUy7ZM3YyJrwP7M",
    authDomain: "magnet-f7299.firebaseapp.com",
    databaseURL: "https://magnet-f7299.firebaseio.com",
    projectId: "magnet-f7299",
    storageBucket: "magnet-f7299.appspot.com",
    messagingSenderId: "263213102480",
    appId: "1:263213102480:web:56e58ecf3d6664ea5cef15",
    measurementId: "G-3PV14LT24B"
};
firebase.initializeApp(firebaseConfig);
var database = firebase.database();

const PARTIES_PATH = "/parties"

// createParty();
// listenToParty("937015");

function createParty(imdb_code) {    
    return new Promise((resolve, reject) => {
        const code = generateRandomCode(6);    
        // const code = "937015";

        checkIfPartyExists(code).then(snapshot => {
            console.log("[PartyManager] Key Collision w/ Code: " + code);
            return createParty(imdb_code);
        }).catch(snapshot => {
            console.log("[PartyManager] Creating Party w/ Code: " + code);
            database.ref(PARTIES_PATH).child(code).set({code: code, imdb_code: imdb_code});
            database.ref(PARTIES_PATH).child(code).child("events").push({
                type: "CREATED",
                timestamp: Date.now()
            });

            resolve(code);
        })     
    });         
}

function checkIfPartyExists(code) {
    return new Promise((resolve, reject) => {
        database.ref(PARTIES_PATH).child(code).once("value", function(snapshot) {
            if (snapshot.exists()) {            
                resolve(snapshot);
            } else { 
                reject(snapshot);
            }
        })
    })
}

function updateTimestamp(code, timestamp) {
    database.ref(PARTIES_PATH).child(code).update({playback: timestamp});
}

function pushGenericEvent(code, tag, value) {
    checkIfPartyExists(code).then(snapshot => {
        console.log("Pushing Generic Event: " + value);
        database.ref(PARTIES_PATH).child(code).child("events").push({
            type: tag,
            timestamp: Date.now(),
            data: value
        });
    }).catch(snapshot => {
        return;
    }) 
}

function generateRandomCode(length) {
    var code = "";
    var set = "0123456789";
    for (var i = 0; i < length; i++) {
        var index = Math.floor(Math.random() * set.length);
        code += set.charAt(index);
    }

    return code;
}

module.exports = {createParty, pushGenericEvent, updateTimestamp, checkIfPartyExists};