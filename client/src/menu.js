// client/src/menu.js - Simple Menu System for Tank Deathmatch

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('menuForm');
    const usernameInput = document.getElementById('username');
    const errorMessage = document.getElementById('errorMessage');
    const joinBtn = document.getElementById('joinBtn');

    // Load saved username
    const saved = localStorage.getItem('tankGameSimpleSettings');
    if (saved) {
        try {
            const settings = JSON.parse(saved);
            if (settings.username) usernameInput.value = settings.username;
        } catch {}
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        errorMessage.textContent = '';
        const username = usernameInput.value.trim();
        if (!username) {
            errorMessage.textContent = 'Please enter a username.';
            usernameInput.focus();
            return;
        }
        if (username.length < 2) {
            errorMessage.textContent = 'Username must be at least 2 characters.';
            usernameInput.focus();
            return;
        }
        if (username.length > 20) {
            errorMessage.textContent = 'Username must be 20 characters or less.';
            usernameInput.focus();
            return;
        }
        // Save username
        localStorage.setItem('tankGameSimpleSettings', JSON.stringify({ username }));
        // Go to game
        window.location.href = `game.html?username=${encodeURIComponent(username)}`;
    });

    // Enter key submits form
    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            joinBtn.click();
        }
    });
}); 