
/* =========================================
   ASTRIX CLOUD - PANEL.JS
   Frontend Demo Control Panel
========================================= */

document.addEventListener("DOMContentLoaded", () => {

  // =====================================
  // ACCOUNTS
  // =====================================

  const accounts = [
    {
      name: "ASTRIX Owner",
      email: "owner@astrixcloud.test",
      password: "astrix123",
      role: "Owner"
    },
    {
      name: "Rahul Admin",
      email: "admin@gmail.com",
      password: "Rahul@4321",
      role: "Admin"
    },
    {
      name: "Demo User",
      email: "user@gmail.com",
      password: "user123",
      role: "User"
    }
  ];

  // =====================================
  // STORAGE
  // =====================================

  function loadData(key, fallback) {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : fallback;
    } catch (error) {
      console.error("Storage error:", error);
      return fallback;
    }
  }

  function saveData(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  let servers = loadData("astrix_servers", []);
  let tickets = loadData("astrix_tickets", []);

  let currentUser = null;

  // =====================================
  // ELEMENTS
  // =====================================

  const loginPage = document.getElementById("loginPage");
  const dashboard = document.getElementById("dashboard");
  const loginForm = document.getElementById("loginForm");
  const loginMessage = document.getElementById("loginMessage");
  const logoutBtn = document.getElementById("logoutBtn");
  const sidebar = document.getElementById("sidebar");
  const menuToggle = document.getElementById("menuToggle");
  const adminNavigation = document.getElementById("adminNavigation");

  // =====================================
  // HELPERS
  // =====================================

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function isAdmin() {
    return currentUser &&
      ["Owner", "Admin"].includes(currentUser.role);
  }

  function showMessage(element, message, isError = false) {
    if (!element) return;

    element.textContent = message;
    element.classList.toggle("error", isError);
  }

  function saveServers() {
    saveData("astrix_servers", servers);
  }

  function saveTickets() {
    saveData("astrix_tickets", tickets);
  }

  function getUserServers() {
    if (isAdmin()) return servers;

    return servers.filter(server =>
      server.owner.toLowerCase() === currentUser.email.toLowerCase()
    );
  }

  function getUserTickets() {
    if (isAdmin()) return tickets;

    return tickets.filter(ticket =>
      ticket.email.toLowerCase() === currentUser.email.toLowerCase()
    );
  }

  // =====================================
  // LOGIN
  // =====================================

  loginForm.addEventListener("submit", event => {
    event.preventDefault();

    const email = document.getElementById("loginEmail")
      .value.trim().toLowerCase();

    const password = document.getElementById("loginPassword").value;

    const account = accounts.find(user =>
      user.email.toLowerCase() === email &&
      user.password === password
    );

    if (!account) {
      showMessage(
        loginMessage,
        "Invalid email or password.",
        true
      );
      return;
    }

    currentUser = {
      name: account.name,
      email: account.email,
      role: account.role
    };

    loginPage.classList.add("hidden");
    dashboard.classList.remove("hidden");

    loginForm.reset();

    updateUserInformation();
    setupNavigation();
    renderDashboard();
    showPage("overview");
  });

  // =====================================
  // USER INFORMATION
  // =====================================

  function updateUserInformation() {
    if (!currentUser) return;

    const firstLetter = currentUser.name.charAt(0).toUpperCase();

    document.getElementById("sidebarUserName").textContent =
      currentUser.name;

    document.getElementById("sidebarUserRole").textContent =
      currentUser.role;

    document.getElementById("userAvatar").textContent =
      firstLetter;

    document.getElementById("topbarUserName").textContent =
      currentUser.name;

    document.getElementById("accountAvatar").textContent =
      firstLetter;

    document.getElementById("accountName").textContent =
      currentUser.name;

    document.getElementById("accountEmail").textContent =
      currentUser.email;

    document.getElementById("accountRole").textContent =
      currentUser.role;

    adminNavigation.classList.toggle("hidden", !isAdmin());
  }

  // =====================================
  // LOGOUT
  // =====================================

  logoutBtn.addEventListener("click", () => {
    currentUser = null;

    dashboard.classList.add("hidden");
    loginPage.classList.remove("hidden");

    sidebar.classList.remove("open");

    loginForm.reset();
    showMessage(loginMessage, "");
  });

  // =====================================
  // NAVIGATION
  // =====================================

  function setupNavigation() {

    document.querySelectorAll("[data-page]").forEach(button => {

      button.addEventListener("click", () => {

        const page = button.dataset.page;

        if (
          ["create-server", "manage-users", "all-servers", "manage-tickets"].includes(page)
          && !isAdmin()
        ) {
          return;
        }

        showPage(page);
        sidebar.classList.remove("open");
      });

    });

  }

  function showPage(pageName) {

    document.querySelectorAll(".page").forEach(page => {
      page.classList.remove("active");
    });

    const selectedPage = document.getElementById(
      "page-" + pageName
    );

    if (!selectedPage) return;

    selectedPage.classList.add("active");

    document.querySelectorAll(".nav-link").forEach(link => {
      link.classList.toggle(
        "active",
        link.dataset.page === pageName
      );
    });

    const titles = {
      overview: "Overview",
      servers: "My Servers",
      tickets: "Support Tickets",
      account: "Account Settings",
      "create-server": "Create Server",
      "manage-users": "Manage Users",
      "all-servers": "All Servers",
      "manage-tickets": "Manage Tickets"
    };

    document.getElementById("pageTitle").textContent =
      titles[pageName] || "ASTRIX CLOUD";

    if (pageName === "overview") renderDashboard();
    if (pageName === "servers") renderMyServers();
    if (pageName === "tickets") renderMyTickets();
    if (pageName === "manage-users") renderUsers();
    if (pageName === "all-servers") renderAllServers();
    if (pageName === "manage-tickets") renderAdminTickets();
  }

  // =====================================
  // MOBILE SIDEBAR
  // =====================================

  menuToggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });

  document.addEventListener("click", event => {
    if (
      window.innerWidth <= 768 &&
      sidebar.classList.contains("open") &&
      !sidebar.contains(event.target) &&
      !menuToggle.contains(event.target)
    ) {
      sidebar.classList.remove("open");
    }
  });

  // =====================================
  // DASHBOARD STATISTICS
  // =====================================

  function renderDashboard() {

    const visibleServers = getUserServers();
    const visibleTickets = getUserTickets();

    const online = visibleServers.filter(server =>
      server.status === "Online"
    ).length;

    document.getElementById("totalServers").textContent =
      visibleServers.length;

    document.getElementById("onlineServers").textContent =
      online;

    document.getElementById("offlineServers").textContent =
      visibleServers.length - online;

    document.getElementById("totalTickets").textContent =
      visibleTickets.length;

    const recent = document.getElementById("recentServers");

    if (visibleServers.length === 0) {
      recent.innerHTML =
        '<p class="empty-state">No servers available yet.</p>';
      return;
    }

    recent.innerHTML = visibleServers.slice(-4).reverse()
      .map(server => `
        <div class="ticket-card">
          <h3>${escapeHTML(server.name)}</h3>
          <p>Software: ${escapeHTML(server.software)}</p>
          <p>RAM: ${escapeHTML(server.memory)}</p>
          <span class="server-status ${
            server.status === "Online" ? "" : "offline"
          }">${escapeHTML(server.status)}</span>
        </div>
      `).join("");
  }

  // =====================================
  // MY SERVERS
  // =====================================

  function renderMyServers() {

    const container = document.getElementById("myServersList");
    const visibleServers = getUserServers();

    if (visibleServers.length === 0) {
      container.innerHTML =
        '<p class="empty-state">No servers found.</p>';
      return;
    }

    container.innerHTML = visibleServers.map(server => `
      <div class="server-card">
        <h3>${escapeHTML(server.name)}</h3>
        <p>Software: ${escapeHTML(server.software)}</p>
        <p>RAM: ${escapeHTML(server.memory)}</p>
        <p>Owner: ${escapeHTML(server.owner)}</p>
        <span class="server-status ${
          server.status === "Online" ? "" : "offline"
        }">${escapeHTML(server.status)}</span>
      </div>
    `).join("");
  }

  // =====================================
  // CREATE SERVER - ADMIN ONLY
  // =====================================

  const createServerForm =
    document.getElementById("createServerForm");

  createServerForm.addEventListener("submit", event => {

    event.preventDefault();

    if (!isAdmin()) return;

    const name = document.getElementById("serverName")
      .value.trim();

    const owner = document.getElementById("serverOwner")
      .value.trim().toLowerCase();

    const software = document.getElementById("serverSoftware").value;
    const memory = document.getElementById("serverMemory").value;

    if (!name || !owner || !software || !memory) {
      showMessage(
        document.getElementById("createServerMessage"),
        "Please complete all fields.",
        true
      );
      return;
    }

    const newServer = {
      id: "SRV-" + Date.now(),
      name,
      owner,
      software,
      memory,
      status: "Online",
      createdAt: new Date().toLocaleString()
    };

    servers.push(newServer);
    saveServers();

    createServerForm.reset();

    showMessage(
      document.getElementById("createServerMessage"),
      "Demo server created successfully!"
    );

    renderDashboard();
    renderAllServers();
  });

  // =====================================
  // ADMIN: ALL SERVERS
  // =====================================

  function renderAllServers() {

    const container = document.getElementById("allServersList");

    if (!isAdmin()) return;

    if (servers.length === 0) {
      container.innerHTML =
        '<p class="empty-state">No servers found.</p>';
      return;
    }

    container.innerHTML = `
      <div style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>Server</th>
              <th>Owner</th>
              <th>Software</th>
              <th>RAM</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${servers.map(server => `
              <tr>
                <td>${escapeHTML(server.name)}</td>
                <td>${escapeHTML(server.owner)}</td>
                <td>${escapeHTML(server.software)}</td>
                <td>${escapeHTML(server.memory)}</td>
                <td>${escapeHTML(server.status)}</td>
                <td>
                  <button
                    class="secondary-btn"
                    data-delete-server="${escapeHTML(server.id)}"
                  >Delete</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  // =====================================
  // DELETE SERVER
  // =====================================

  document.addEventListener("click", event => {

    const button = event.target.closest("[data-delete-server]");

    if (!button || !isAdmin()) return;

    const serverId = button.dataset.deleteServer;

    if (!confirm("Delete this demo server?")) return;

    servers = servers.filter(server => server.id !== serverId);

    saveServers();
    renderAllServers();
    renderMyServers();
    renderDashboard();
  });

  // =====================================
  // ADMIN: MANAGE USERS
  // =====================================

  function renderUsers() {

    const container = document.getElementById("usersList");

    if (!isAdmin()) return;

    container.innerHTML = `
      <div style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            ${accounts.map(user => `
              <tr>
                <td>${escapeHTML(user.name)}</td>
                <td>${escapeHTML(user.email)}</td>
                <td>${escapeHTML(user.role)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <p class="empty-state">
        These are demo accounts built into this frontend.
      </p>
    `;
  }

  // =====================================
  // CREATE SUPPORT TICKET
  // =====================================

  const ticketForm = document.getElementById("ticketForm");

  ticketForm.addEventListener("submit", event => {

    event.preventDefault();

    if (!currentUser) return;

    const subject = document.getElementById("ticketSubject")
      .value.trim();

    const category = document.getElementById("ticketCategory").value;

    const description = document.getElementById("ticketDescription")
      .value.trim();

    if (!subject || !category || !description) return;

    const newTicket = {
      id: "TKT-" + Date.now(),
      name: currentUser.name,
      email: currentUser.email,
      subject,
      category,
      description,
      status: "Open",
      createdAt: new Date().toLocaleString()
    };

    tickets.push(newTicket);
    saveTickets();

    ticketForm.reset();

    renderMyTickets();
    renderDashboard();

    alert("Your demo support ticket was submitted!");
  });

  // =====================================
  // MY TICKETS
  // =====================================

  function renderMyTickets() {

    const container = document.getElementById("myTicketsList");
    const visibleTickets = getUserTickets();

    if (visibleTickets.length === 0) {
      container.innerHTML =
        '<p class="empty-state">No tickets submitted.</p>';
      return;
    }

    container.innerHTML = visibleTickets.slice().reverse()
      .map(ticket => `
        <div class="ticket-card">
          <h3>${escapeHTML(ticket.subject)}</h3>
          <p>Ticket ID: ${escapeHTML(ticket.id)}</p>
          <p>Category: ${escapeHTML(ticket.category)}</p>
          <p>${escapeHTML(ticket.description)}</p>
          <p>Created: ${escapeHTML(ticket.createdAt)}</p>
          <span class="ticket-status ${
            ticket.status === "Open" ? "open" : "closed"
          }">${escapeHTML(ticket.status)}</span>
        </div>
      `).join("");
  }

  // =====================================
  // ADMIN: MANAGE TICKETS
  // =====================================

  function renderAdminTickets() {

    const container = document.getElementById("adminTicketsList");

    if (!isAdmin()) return;

    if (tickets.length === 0) {
      container.innerHTML =
        '<p class="empty-state">No tickets found.</p>';
      return;
    }

    container.innerHTML = tickets.slice().reverse()
      .map(ticket => `
        <div class="ticket-card">
          <h3>${escapeHTML(ticket.subject)}</h3>
          <p>Ticket ID: ${escapeHTML(ticket.id)}</p>
          <p>User: ${escapeHTML(ticket.name)}</p>
          <p>Email: ${escapeHTML(ticket.email)}</p>
          <p>Category: ${escapeHTML(ticket.category)}</p>
          <p>${escapeHTML(ticket.description)}</p>
          <p>Created: ${escapeHTML(ticket.createdAt)}</p>

          <span class="ticket-status ${
            ticket.status === "Open" ? "open" : "closed"
          }">${escapeHTML(ticket.status)}</span>

          <div style="margin-top:15px">
            <button
              class="secondary-btn"
              data-toggle-ticket="${escapeHTML(ticket.id)}"
            >
              ${ticket.status === "Open" ? "Close Ticket" : "Reopen Ticket"}
            </button>
          </div>
        </div>
      `).join("");
  }

  // =====================================
  // ADMIN: UPDATE TICKET STATUS
  // =====================================

  document.addEventListener("click", event => {

    const button = event.target.closest("[data-toggle-ticket]");

    if (!button || !isAdmin()) return;

    const ticketId = button.dataset.toggleTicket;

    const ticket = tickets.find(item => item.id === ticketId);

    if (!ticket) return;

    ticket.status = ticket.status === "Open" ? "Closed" : "Open";

    saveTickets();

    renderAdminTickets();
    renderDashboard();
  });

});
