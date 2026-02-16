// ============================================================
// welcome.js — Onboarding page logic
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    // Close page button
    document.getElementById('closePage').addEventListener('click', () => {
        window.close();
    });

    // Skip account
    document.getElementById('skipAccount').addEventListener('click', () => {
        window.close();
    });

    // Google Sign-In (placeholder)
    document.getElementById('googleSignIn').addEventListener('click', () => {
        alert('Google Sign-In will be configured once the Supabase project is set up. Your extension works fully without an account!');
    });
});
