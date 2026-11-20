function adminLogin() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const message = document.getElementById("loginMessage");

  if (username === "admin" && password === "astrix123") {
    document.getElementById("loginScreen").style.display = "none";
  } else {
    message.textContent = "Invalid username or password!";
  }
}

console.log("ASTRIX CLOUD Loaded!");
