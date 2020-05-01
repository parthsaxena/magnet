// Params is an object with each
window.$ = window.jQuery = require('jquery');

function link_movieDetails(movie_id){
    if(!autoplay) {
        $("#bg_layer").fadeOut(150, function(){
          location.href = 'movie?q='+movie_id;
        });   
    } else {
        $("#bg_layer").fadeOut(150, function(){
          location.href = 'movie?q='+movie_id+"&previous_id="+IMDB_ID;
        });
    }
}

function findGetParameter(parameterName) {
    var result = null,
        tmp = [];
    location.search
        .substr(1)
        .split("&")
        .forEach(function (item) {
        tmp = item.split("=");
        if (tmp[0] === parameterName) result = decodeURIComponent(tmp[1]);
        });
    return result;
}

function previousPage(){
    $("#bg_layer").fadeOut(300, function(){
        // Check for restart paramater
        var field = 'previous_id';
        var check_url = window.location.href;        
        if(check_url.indexOf('?' + field + '=') != -1) {
            window.location = "/movie?q=" + findGetParameter(field);
        } else if(check_url.indexOf('&' + field + '=') != -1) {
            window.location = "/movie?q=" + findGetParameter(field);
        } else {          
            if (autoplay) {
                window.location = "/trending";
            } else {
                window.history.back();   
            }            
        }        
    });
}

function signInUser(){
  var email = document.getElementById("login_email").value;
  var password = document.getElementById("login_password").value;
  firebase.auth().signInWithEmailAndPassword(email, password).catch(function(error) {
    var errorCode = error.code;
    var errorMessage = error.message;
    document.getElementById("login_error").innerHTML = errorMessage;
    console.log(errorCode);
    console.log(errorMessage)
  });
}

function createUser_RDB(user_id, email){
    firebase.database().ref("users/"+user_id).set({
      user_id: user_id,
      email: email,
    });
}

function signUpUser(){
  var email = document.getElementById("signup_email").value;
  var password = document.getElementById("signup_password").value;
  firebase.auth().createUserWithEmailAndPassword(email, password).then(function(user){
    firebase.auth().signInWithEmailAndPassword(email, password).then(function(error){
      console.log("Error code: "+ error.code);
      console.log("Error message: "+error.message);
    });
    firebase.auth().onAuthStateChanged(function(user) {
      if (user) {
        createUser_RDB(user.uid, user.email);
        console.log("User created in realtime db.");
      } else {
        console.log("User is not signed in.");
      }
    });
  }).catch(function(error){
    var errorCode = error.code;
    var errorMessage = error.message;
    document.getElementById("signup_error").innerHTML = errorMessage;
    console.log(errorCode);
    console.log(errorMessage);
  });
}
