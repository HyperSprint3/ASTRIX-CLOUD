
document.addEventListener("DOMContentLoaded", () => {
    // ==========================================
    // ASTRIX CLOUD - MAIN PANEL
    // Database authentication and support tickets
    // ==========================================

    let currentUser = null;
    let tickets = [];
    let servers = JSON.parse(localStorage.getItem("astrix_servers") || "[]");

    const $ = (id) => document.getElementById(id);

    // ---------- HELPERS ----------

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[char]));
    }

    function formatDate(value) {
        if (!value) return "Just now";
        const date = new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z"));
        return isNaN(date.getTime()) ? value : date.toLocaleString();
    }

    async function api(url, options = {}) {
        const response = await fetch(url, {
            credentials: "same-origin",
            ...options,
            headers: {
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...(options.headers || {})
            }
        });

        let data = {};
        try {
            data = await response.json();
        } catch {
            throw new Error("The server returned an invalid response.");
        }

        if (!response.ok) {
            throw new Error(data.error || data.message || "Request failed.");
        }

        return data;
    }

    function showMessage(element, message, success = false) {
        if (!element) return;
        element.textContent = message;
        element.style.color = success ? "#22c55e" : "#ef4444";
    }

    function isStaff() {
        return ["owner", "admin", "staff"].includes(
            String(currentUser?.role || "").toLowerCase()
        );
    }

    function normalizeUser(user) {
        if (!user) return null;
        return {
            ...user,
            name: user.username || user.name || "User",
            role: String(user.role || "member").toLowerCase()
        };
    }

    // ---------- LOGIN / LOGOUT ----------

    function showLogin() {
        if ($("loginPage")) $("loginPage").style.display = "flex";
        if ($("dashboard")) $("dashboard").style.display = "none";
    }

    function showDashboard() {
        if ($("loginPage")) $("loginPage").style.display = "none";
        if ($("dashboard")) $("dashboard").style.display = "block";

        updateUserDetails();
        updatePermissions();
        updateDashboard();
        navigateTo("overview");
    }

    function updateUserDetails() {
        if (!currentUser) return;

        const name = currentUser.username || currentUser.name || "User";
        const email = currentUser.email || "";
        const role = currentUser.role || "member";
        const avatar = name.charAt(0).toUpperCase();

        if ($("sidebarUserName")) $("sidebarUserName").textContent = name;
        if ($("sidebarUserRole")) $("sidebarUserRole").textContent = role;
        if ($("userAvatar")) $("userAvatar").textContent = avatar;
        if ($("topbarUserName")) $("topbarUserName").textContent = name;
        if ($("accountAvatar")) $("accountAvatar").textContent = avatar;
        if ($("accountName")) $("accountName").textContent = name;
        if ($("accountEmail")) $("accountEmail").textContent = email;
        if ($("accountRole")) $("accountRole").textContent = role;
    }

    function updatePermissions() {
        const staff = isStaff();

        if ($("adminNavigation")) {
            $("adminNavigation").style.display = staff ? "" : "none";
        }

        document.querySelectorAll("[data-page]").forEach((link) => {
            const page = link.dataset.page;
            const restricted = [
                "create-server",
                "manage-users",
                "all-servers",
                "manage-tickets"
            ];

            if (restricted.includes(page)) {
                link.style.display = staff ? "" : "none";
            }
        });
    }

    $("loginForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();

        const email = $("loginEmail")?.value.trim();
        const password = $("loginPassword")?.value;
        const message = $("loginMessage");

        showMessage(message, "Logging in...", true);

        try {
            const result = await api("/api/login", {
                method: "POST",
                body: JSON.stringify({ email, password })
            });

            currentUser = normalizeUser(result.user || result);
            if (!currentUser?.id) {
                throw new Error("Login response did not contain a user.");
            }

            if ($("loginPassword")) $("loginPassword").value = "";
            showDashboard();
            await loadTickets();
        } catch (error) {
            showMessage(message, error.message);
        }
    });

    $("logoutBtn")?.addEventListener("click", async () => {
        try {
            await api("/api/logout", { method: "POST" });
        } catch (error) {
            console.error("Logout error:", error);
        }

        currentUser = null;
        tickets = [];
        showLogin();
    });

    async function restoreSession() {
        try {
            const result = await api("/api/me");
            currentUser = normalizeUser(result.user || result);

            if (!currentUser?.id) throw new Error("No active session.");

            showDashboard();
            await loadTickets();
        } catch {
            currentUser = null;
            showLogin();
        }
    }

    // ---------- NAVIGATION ----------

    function navigateTo(page) {
        if (!page) return;

        const restricted = [
            "create-server",
            "manage-users",
            "all-servers",
            "manage-tickets"
        ];

        if (restricted.includes(page) && !isStaff()) {
            page = "overview";
        }

        document.querySelectorAll(".page-content").forEach((section) => {
            section.style.display = "none";
        });

        const target = $("page-" + page);
        if (target) target.style.display = "block";

        document.querySelectorAll("[data-page]").forEach((link) => {
            link.classList.toggle("active", link.dataset.page === page);
        });

        const activeLink = document.querySelector(`[data-page="${page}"]`);
        if ($("pageTitle") && activeLink) {
            $("pageTitle").textContent = activeLink.textContent.trim();
        }

        if (page.includes("ticket")) loadTickets();
        if (page === "overview") updateDashboard();

        if ($("sidebar")) $("sidebar").classList.remove("active");
    }

    document.querySelectorAll("[data-page]").forEach((link) => {
        link.addEventListener("click", (event) => {
            event.preventDefault();
            navigateTo(link.dataset.page);
        });
    });

    $("menuToggle")?.addEventListener("click", () => {
        $("sidebar")?.classList.toggle("active");
    });

    // ---------- SERVERS (DEMO STORAGE) ----------

    function saveServers() {
        localStorage.setItem("astrix_servers", JSON.stringify(servers));
    }

    function getUserServers() {
        if (isStaff()) return servers;
        return servers.filter(server => server.owner === currentUser?.email);
    }

    function renderServers() {
        const myList = $("myServersList");
        const allList = $("allServersList");
        const recentList = $("recentServers");

        const myServers = getUserServers();

        function serverHTML(server) {
            return `
                <div class="server-card">
                    <h3>${escapeHTML(server.name)}</h3>
                    <p>Owner: ${escapeHTML(server.owner)}</p>
                    <p>Software: ${escapeHTML(server.software)}</p>
                    <p>Memory: ${escapeHTML(server.memory)} MB</p>
                    <span>${escapeHTML(server.status || "Offline")}</span>
                </div>
            `;
        }

        if (myList) {
            myList.innerHTML = myServers.length
                ? myServers.map(serverHTML).join("")
                : "<p>No servers found.</p>";
        }

        if (allList && isStaff()) {
            allList.innerHTML = servers.length
                ? servers.map(serverHTML).join("")
                : "<p>No servers created yet.</p>";
        }

        if (recentList) {
            recentList.innerHTML = servers.length
                ? servers.slice(-3).reverse().map(serverHTML).join("")
                : "<p>No recent servers.</p>";
        }
    }

    $("createServerForm")?.addEventListener("submit", (event) => {
        event.preventDefault();

        if (!isStaff()) return;

        const name = $("serverName")?.value.trim();
        const owner = $("serverOwner")?.value.trim() || currentUser.email;
        const software = $("serverSoftware")?.value;
        const memory = $("serverMemory")?.value;

        if (!name) {
            showMessage($("createServerMessage"), "Enter a server name.");
            return;
        }

        servers.push({
            id: Date.now(),
            name,
            owner,
            software,
            memory,
            status: "Offline",
            createdAt: new Date().toISOString()
        });

        saveServers();
        $("createServerForm").reset();
        showMessage($("createServerMessage"), "Server added to demo list.", true);
        renderServers();
        updateDashboard();
    });

    // ---------- SUPPORT TICKETS ----------

    async function loadTickets() {
        if (!currentUser) return;

        try {
            const result = await api("/api/tickets");
            tickets = Array.isArray(result)
                ? result
                : (result.tickets || result.data || []);

            renderTickets();
            updateDashboard();
        } catch (error) {
            console.error("Ticket loading error:", error);

            if ($("myTicketsList")) {
                $("myTicketsList").innerHTML =
                    `<p>Could not load tickets: ${escapeHTML(error.message)}</p>`;
            }

            if ($("adminTicketsList")) {
                $("adminTicketsList").innerHTML =
                    `<p>Could not load tickets: ${escapeHTML(error.message)}</p>`;
            }
        }
    }

    function ticketHTML(ticket) {
        const status = String(ticket.status || "open").toLowerCase();
        const staff = isStaff();

        return `
            <div class="ticket-card" data-ticket-id="${Number(ticket.id)}">
                <h3>${escapeHTML(ticket.subject)}</h3>
                <p><strong>Ticket #${Number(ticket.id)}</strong></p>
                <p>Category: ${escapeHTML(ticket.category || "General")}</p>
                ${staff ? `<p>Member: ${escapeHTML(ticket.username || ticket.email || "Member")}</p>` : ""}
                <p>${escapeHTML(ticket.description || "")}</p>
                <p>Status: <strong>${escapeHTML(status.toUpperCase())}</strong></p>
                <p>Created: ${escapeHTML(formatDate(ticket.created_at))}</p>

                <button type="button" data-open-replies="${Number(ticket.id)}">
                    View / Reply
                </button>

                ${staff ? `
                    <button type="button"
                        data-ticket-status="${Number(ticket.id)}"
                        data-status="${status === "closed" ? "open" : "closed"}">
                        ${status === "closed" ? "Reopen" : "Close"} Ticket
                    </button>
                ` : ""}

                <div class="ticket-replies" id="replies-${Number(ticket.id)}" style="display:none;">
                    <div class="reply-list">Loading replies...</div>
                    <form class="reply-form" data-reply-form="${Number(ticket.id)}">
                        <textarea name="message" placeholder="Write your reply..." required></textarea>
                        <button type="submit">Send Reply</button>
                    </form>
                </div>
            </div>
        `;
    }

    function renderTickets() {
        const myList = $("myTicketsList");
        const staffList = $("adminTicketsList");

        if (myList) {
            const mine = tickets.filter(ticket =>
                Number(ticket.user_id) === Number(currentUser?.id)
            );

            myList.innerHTML = mine.length
                ? mine.map(ticketHTML).join("")
                : "<p>You haven't created any support tickets yet.</p>";
        }

        if (staffList && isStaff()) {
            staffList.innerHTML = tickets.length
                ? tickets.map(ticketHTML).join("")
                : "<p>No support tickets found.</p>";
        }
    }

    $("ticketForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();

        const subject = $("ticketSubject")?.value.trim();
        const category = $("ticketCategory")?.value;
        const description = $("ticketDescription")?.value.trim();

        if (!subject || !description) {
            alert("Please fill in the subject and description.");
            return;
        }

        try {
            await api("/api/tickets", {
                method: "POST",
                body: JSON.stringify({ subject, category, description })
            });

            $("ticketForm").reset();
            alert("Your support ticket has been created!");
            await loadTickets();
        } catch (error) {
            alert("Ticket error: " + error.message);
        }
    });

    // ---------- TICKET REPLIES ----------

    async function loadReplies(ticketId) {
        const container = $("replies-" + ticketId);
        if (!container) return;

        const list = container.querySelector(".reply-list");
        if (list) list.textContent = "Loading replies...";

        try {
            const result = await api(
                "/api/ticket-replies?ticket_id=" + encodeURIComponent(ticketId)
            );

            const replies = Array.isArray(result)
                ? result
                : (result.replies || result.data || []);

            if (!list) return;

            list.innerHTML = replies.length
                ? replies.map(reply => `
                    <div class="ticket-reply">
                        <strong>${escapeHTML(reply.username || reply.sender_name || "User")}</strong>
                        <p>${escapeHTML(reply.message)}</p>
                        <small>${escapeHTML(formatDate(reply.created_at))}</small>
                    </div>
                `).join("")
                : "<p>No replies yet.</p>";
        } catch (error) {
            if (list) {
                list.textContent = "Could not load replies: " + error.message;
            }
        }
    }

    document.addEventListener("click", async (event) => {
        const replyButton = event.target.closest("[data-open-replies]");

        if (replyButton) {
            const ticketId = replyButton.dataset.openReplies;
            const container = $("replies-" + ticketId);

            if (container) {
                const opening = container.style.display === "none";
                container.style.display = opening ? "block" : "none";

                if (opening) await loadReplies(ticketId);
            }
        }

        const statusButton = event.target.closest("[data-ticket-status]");

        if (statusButton) {
            const ticketId = statusButton.dataset.ticketStatus;
            const status = statusButton.dataset.status;

            try {
                await api("/api/ticket-status", {
                    method: "PATCH",
                    body: JSON.stringify({
                        ticket_id: Number(ticketId),
                        status
                    })
                });

                await loadTickets();
            } catch (error) {
                alert("Could not update ticket: " + error.message);
            }
        }
    });

    document.addEventListener("submit", async (event) => {
        const form = event.target.closest("[data-reply-form]");
        if (!form) return;

        event.preventDefault();

        const ticketId = Number(form.dataset.replyForm);
        const message = form.querySelector('[name="message"]')?.value.trim();

        if (!message) return;

        const button = form.querySelector('button[type="submit"]');
        if (button) button.disabled = true;

        try {
            await api("/api/ticket-replies", {
                method: "POST",
                body: JSON.stringify({
                    ticket_id: ticketId,
                    message
                })
            });

            form.reset();
            await loadReplies(ticketId);
        } catch (error) {
            alert("Could not send reply: " + error.message);
        } finally {
            if (button) button.disabled = false;
        }
    });

    // ---------- USERS ----------

    function renderUsers() {
        if (!$("usersList")) return;

        $("usersList").innerHTML = `
            <p>User management is not connected yet.
            The database login and staff permissions are active.</p>
        `;
    }

    // ---------- DASHBOARD ----------

    function updateDashboard() {
        if (!currentUser) return;

        const visibleServers = getUserServers();

        if ($("totalServers")) {
            $("totalServers").textContent = visibleServers.length;
        }

        if ($("onlineServers")) {
            $("onlineServers").textContent =
                visibleServers.filter(server => server.status === "Online").length;
        }

        if ($("offlineServers")) {
            $("offlineServers").textContent =
                visibleServers.filter(server => server.status !== "Online").length;
        }

        if ($("totalTickets")) {
            $("totalTickets").textContent = isStaff()
                ? tickets.length
                : tickets.filter(ticket =>
                    Number(ticket.user_id) === Number(currentUser.id)
                ).length;
        }

        renderServers();
        renderUsers();
    }

    // ---------- START ----------

    restoreSession();
});
