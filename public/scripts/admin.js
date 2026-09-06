// CarnegienFreedom Dynamic Admin Panel
// Full CRUD operations through the Node.js API

let db = null;
let currentPost = null;
let isEditing = false;
let registrationMode = false;
let uploadedDocumentName = '';
let currentAdminUser = null;

async function authRequest(path, body) {
    const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body)
    });
    const result = response.status === 204 ? null : await response.json();
    if (!response.ok) {
        throw new Error(result?.error || 'Authentication request failed');
    }
    return result;
}

// ==================== AUTHENTICATION ====================

async function checkAuth() {
    if (localStorage.getItem('legitways_logged_out') === 'true') {
        return;
    }

    try {
        const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
        if (response.ok) {
            await initAdmin();
        }
    } catch (error) {
        console.warn('No active admin session');
    }
}

async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('adminEmail').value.trim();
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value;
    const errorMessage = document.getElementById('errorMessage');
    const loginBtn = document.getElementById('loginBtn');

    loginBtn.disabled = true;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';

    try {
        await authRequest(registrationMode ? '/api/auth/register' : '/api/auth/login', {
            ...(registrationMode ? { username } : {}),
            email,
            password
        });
        localStorage.removeItem('legitways_logged_out');
        await initAdmin();
    } catch (error) {
        document.getElementById('errorText').textContent = error.message;
        errorMessage.classList.add('show');
        document.querySelector('.login-box').classList.add('shake');
        setTimeout(() => {
            document.querySelector('.login-box').classList.remove('shake');
        }, 500);
    }

    loginBtn.disabled = false;
    loginBtn.innerHTML = registrationMode
        ? '<i class="fas fa-user-plus"></i> Register'
        : '<i class="fas fa-sign-in-alt"></i> Log In';
}

function applyCurrentAdminAuthor() {
    const authorField = document.getElementById('postAuthor');
    if (!authorField) return;

    const username = currentAdminUser?.username || authorField.value.trim();
    if (username) {
        authorField.value = username;
        authorField.readOnly = true;
        authorField.setAttribute('aria-readonly', 'true');
    }
}

async function initAdmin() {
    document.getElementById('loginScreen').classList.add('is-hidden');
    document.getElementById('adminPanel').classList.add('show');

    // Initialize database
    const dbAPI = await LegitWaysDB.initDB();
    db = dbAPI;

    // Fetch the current admin and lock the author to this username
    try {
        const sessionResponse = await fetch('/api/auth/session', { credentials: 'same-origin' });
        if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json();
            currentAdminUser = sessionData.user || null;
            applyCurrentAdminAuthor();
        }
    } catch (error) {
        console.warn('Could not fetch admin session:', error);
    }

    // Load initial data
    await refreshData();
}

async function logout() {
    localStorage.setItem('legitways_logged_out', 'true');
    try {
        await authRequest('/api/auth/logout', {});
    } finally {
        location.reload();
    }
}

function toggleAuthMode() {
    registrationMode = !registrationMode;
    const usernameInput = document.getElementById('adminUsername');
    document.getElementById('usernameField').classList.toggle('is-hidden', !registrationMode);
    usernameInput.required = registrationMode;
    document.getElementById('adminPassword').autocomplete = registrationMode ? 'new-password' : 'current-password';
    document.getElementById('authPrompt').textContent = registrationMode
        ? 'Create the first admin account'
        : 'Log in to manage blog posts';
    document.getElementById('loginBtn').innerHTML = registrationMode
        ? '<i class="fas fa-user-plus"></i> Register'
        : '<i class="fas fa-sign-in-alt"></i> Log In';
    document.getElementById('authSwitch').textContent = registrationMode
        ? 'Already have an account? Log in'
        : 'Need an account? Register';
    document.getElementById('errorMessage').classList.remove('show');
}

function togglePassword() {
    const input = document.getElementById('adminPassword');
    const toggle = document.getElementById('togglePassword');
    const icon = toggle.querySelector('i');
    const isVisible = input.type === 'text';

    if (isVisible) {
        input.type = 'password';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye');
        toggle.setAttribute('aria-label', 'Show password');
        toggle.title = 'Show password';
    } else {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
        toggle.setAttribute('aria-label', 'Hide password');
        toggle.title = 'Hide password';
    }
}

// ==================== DATA MANAGEMENT ====================

async function refreshData() {
    await updateStats();
    await renderPostsList();
    await updateDocumentStatus();
}

async function updateStats() {
    const posts = await db.getAllPosts();
    const categories = await db.getAllCategories();

    document.getElementById('totalPosts').textContent = posts.length;
    document.getElementById('totalCategories').textContent = categories.length;
    document.getElementById('featuredPosts').textContent =
        posts.filter(p => p.featured).length;

    if (posts.length > 0) {
        const dates = posts.map(p => new Date(p.date));
        const maxDate = new Date(Math.max(...dates));
        document.getElementById('lastUpdated').textContent =
            maxDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}

// ==================== FORM HANDLING ====================

// Auto-generate slug
document.getElementById('postTitle')?.addEventListener('input', (e) => {
    if (!isEditing) {
        const title = e.target.value;
        const slug = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        document.getElementById('postSlug').value = slug;
    }
});

// Character count
document.getElementById('postExcerpt')?.addEventListener('input', (e) => {
    document.getElementById('excerptCount').textContent = e.target.value.length;
});

// Handle form submission
document.getElementById('postForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await savePost();
});

async function savePost() {
    showLoading(true);

    const content = document.getElementById('postContent').value;
    if (!content.trim()) {
        alert('Please upload an article document before publishing.');
        showLoading(false);
        return;
    }

    const authorName = currentAdminUser?.username || document.getElementById('postAuthor').value.trim();

    const postData = {
        id: isEditing && currentPost ? currentPost.id : Date.now().toString(),
        slug: document.getElementById('postSlug').value,
        title: document.getElementById('postTitle').value,
        excerpt: document.getElementById('postExcerpt').value,
        category: document.getElementById('postCategory').value,
        categoryLabel: document.getElementById('postCategory').selectedOptions[0].text,
        author: authorName,
        date: isEditing && currentPost ? currentPost.date : new Date().toISOString().split('T')[0],
        readTime: document.getElementById('postReadTime').value,
        featured: document.getElementById('postFeatured').checked,
        image: document.getElementById('postImage').value ||
            'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800&q=80',
        tags: document.getElementById('postTags').value.split(',').map(t => t.trim()).filter(t => t),
        content,
        sourceDocumentName: uploadedDocumentName || (isEditing && currentPost ? currentPost.sourceDocumentName : null)
    };

    try {
        // Check for duplicate slug (excluding current post when editing)
        const existing = await db.getPostBySlug(postData.slug);
        if (existing && existing.id !== postData.id) {
            alert('A post with this URL slug already exists. Please use a unique slug.');
            showLoading(false);
            return;
        }

        // Save to database
        await db.savePost(postData);

        // Update category counts
        await db.updateCategoryCounts();

        // Refresh data
        await refreshData();

        // Show success
        showNotification(isEditing ? 'Post updated successfully!' : 'Post published successfully!');

        // Clear form and reset state
        clearForm();

        // Switch to manage tab
        switchTab('manage');

    } catch (error) {
        console.error('Error saving post:', error);
        alert('Error saving post. Please try again.');
    }

    showLoading(false);
}

function previewPost() {
    const title = document.getElementById('postTitle').value;
    const content = document.getElementById('postContent').value;
    const category = document.getElementById('postCategory').selectedOptions[0]?.text || 'Uncategorized';
    const author = currentAdminUser?.username || document.getElementById('postAuthor').value;

    if (!title || !content) {
        alert('Please enter at least a title and content to preview.');
        return;
    }

    const previewHTML = `
        <article style="max-width: 800px; margin: 0 auto;">
            <span style="display: inline-block; background: #3CB54A; color: white; padding: 0.25rem 0.75rem; border-radius: 50px; font-size: 0.75rem; margin-bottom: 1rem;">${category}</span>
            <h1 style="color: #0B2A4A; font-size: 2rem; margin-bottom: 1rem;">${title}</h1>
            <div style="color: #6b7280; margin-bottom: 2rem;">
                <span>By ${author}</span> • <span>${new Date().toLocaleDateString()}</span>
            </div>
            <div class="article-content" style="line-height: 1.8;">
                ${content}
            </div>
        </article>
    `;

    document.getElementById('previewContent').innerHTML = previewHTML;
    document.getElementById('previewSection').classList.remove('is-hidden');
    document.getElementById('previewSection').scrollIntoView({ behavior: 'smooth' });
}

async function loadArticleDocument(file) {
    if (!file) return;

    const status = document.getElementById('documentStatus');
    status.textContent = `Reading ${file.name}...`;

    try {
        let content;
        if (file.name.toLowerCase().endsWith('.docx')) {
            if (!window.mammoth) {
                throw new Error('The Word document reader is unavailable. Refresh the page and try again.');
            }
            const result = await window.mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
            content = result.value;
        } else {
            const text = await file.text();
            content = text.split(/\r?\n\s*\r?\n/)
                .map(paragraph => paragraph.trim())
                .filter(Boolean)
                .map(paragraph => `<p>${escapeDocumentText(paragraph).replace(/\r?\n/g, '<br>')}</p>`)
                .join('');
        }

        if (!content.trim()) {
            throw new Error('The selected document is empty.');
        }

        document.getElementById('postContent').value = content;
        uploadedDocumentName = file.name;
        status.textContent = `${file.name} loaded successfully.`;
        if (!document.getElementById('postTitle').value) {
            document.getElementById('postTitle').value = file.name.replace(/\.(docx|txt)$/i, '').replace(/[-_]+/g, ' ');
            document.getElementById('postTitle').dispatchEvent(new Event('input'));
        }
    } catch (error) {
        document.getElementById('documentFile').value = '';
        status.textContent = 'No document selected.';
        alert(error.message || 'Unable to read the selected document.');
    }
}

function closePreview() {
    document.getElementById('previewSection').classList.add('is-hidden');
}

function clearForm() {
    document.getElementById('postForm').reset();
    document.getElementById('excerptCount').textContent = '0';
    document.getElementById('previewSection').classList.add('is-hidden');
    currentPost = null;
    isEditing = false;
    uploadedDocumentName = '';
    document.getElementById('documentFile').required = true;
    document.getElementById('documentStatus').textContent = 'No document selected.';

    // Update UI
    const submitBtn = document.querySelector('#postForm button[type="submit"]');
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Publish Post';
    }
}

// ==================== POSTS MANAGEMENT ====================

async function renderPostsList() {
    const container = document.getElementById('postsList');
    const posts = await db.getAllPosts();

    if (posts.length === 0) {
        container.innerHTML = `
            <div style="padding: 3rem; text-align: center; color: #6b7280;">
                <i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: 1rem; color: #4FA3D1;"></i>
                <p>No posts yet. Create your first post!</p>
            </div>
        `;
        return;
    }

    // Sort by date (newest first)
    const sortedPosts = posts.sort((a, b) => new Date(b.date) - new Date(a.date));

    container.innerHTML = sortedPosts.map(post => `
        <div class="post-item">
            <div class="post-info">
                <h4>${post.title}</h4>
                <div class="post-meta">
                    <span><i class="fas fa-folder"></i> ${post.categoryLabel}</span>
                    <span><i class="fas fa-calendar"></i> ${formatDate(post.date)}</span>
                    <span><i class="fas fa-user"></i> ${post.author}</span>
                    ${post.featured ? '<span style="color: #F2C94C;"><i class="fas fa-star"></i> Featured</span>' : ''}
                </div>
            </div>
            <div class="post-actions">
                <button type="button" class="btn-icon btn-view" onclick="viewPost('${post.slug}')" title="View post" aria-label="View post">
                    <i class="fas fa-eye" aria-hidden="true"></i>
                </button>
                <button type="button" class="btn-icon btn-edit" onclick="editPost('${post.id}')" title="Edit post" aria-label="Edit post">
                    <i class="fas fa-pen-to-square" aria-hidden="true"></i>
                </button>
                <button type="button" class="btn-icon btn-delete" onclick="deletePost('${post.id}')" title="Delete post" aria-label="Delete post">
                    <i class="fas fa-trash-can" aria-hidden="true"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function viewPost(slug) {
    window.open(`blog-post.html?slug=${slug}`, '_blank');
}

async function editPost(id) {
    const posts = await db.getAllPosts();
    const post = posts.find(p => p.id === id);

    if (!post) {
        alert('Post not found');
        return;
    }

    // Load into form
    document.getElementById('postTitle').value = post.title;
    document.getElementById('postSlug').value = post.slug;
    document.getElementById('postCategory').value = post.category;
    document.getElementById('postAuthor').value = currentAdminUser?.username || post.author;
    document.getElementById('postAuthor').readOnly = true;
    document.getElementById('postReadTime').value = post.readTime;
    document.getElementById('postImage').value = post.image || '';
    document.getElementById('postExcerpt').value = post.excerpt;
    document.getElementById('postContent').value = post.content;
    uploadedDocumentName = post.sourceDocumentName || '';
    document.getElementById('documentFile').required = false;
    document.getElementById('documentStatus').textContent = post.sourceDocumentName
        ? `Stored document: ${post.sourceDocumentName}`
        : 'Existing article content loaded. Upload a document to replace it.';
    document.getElementById('postTags').value = post.tags.join(', ');
    document.getElementById('postFeatured').checked = post.featured;

    // Update character count
    document.getElementById('excerptCount').textContent = post.excerpt.length;

    // Set editing state
    currentPost = post;
    isEditing = true;

    // Update submit button
    const submitBtn = document.querySelector('#postForm button[type="submit"]');
    submitBtn.innerHTML = '<i class="fas fa-save"></i> Update Post';

    // Switch to add tab
    switchTab('add');

    // Scroll to form
    document.getElementById('postForm').scrollIntoView({ behavior: 'smooth' });

    showNotification('Post loaded for editing');
}

async function deletePost(id) {
    if (!confirm('Are you sure you want to delete this post? This cannot be undone.')) {
        return;
    }

    showLoading(true);

    try {
        await db.deletePost(id);
        await db.updateCategoryCounts();
        await refreshData();
        showNotification('Post deleted successfully');
    } catch (error) {
        console.error('Error deleting post:', error);
        alert('Error deleting post. Please try again.');
    }

    showLoading(false);
}

// ==================== DOCUMENT EXPORT ====================

function escapeDocumentText(value) {
    return String(value || '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[character]));
}

function buildDocumentHTML(posts) {
    const articles = posts.map(post => `
        <article class="post">
            <h1>${escapeDocumentText(post.title)}</h1>
            <p class="meta">${escapeDocumentText(post.categoryLabel)} | By ${escapeDocumentText(post.author)} | ${escapeDocumentText(formatDate(post.date))}</p>
            <p class="excerpt"><strong>${escapeDocumentText(post.excerpt)}</strong></p>
            <div>${post.content || ''}</div>
        </article>
    `).join('');

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>CarnegienFreedom Blog</title>
<style>
body { font-family: Arial, sans-serif; color: #172033; line-height: 1.6; margin: 40px; }
h1 { color: #071A3D; font-size: 24px; margin-bottom: 8px; }
.cover { border-bottom: 4px solid #D9A441; margin-bottom: 32px; padding-bottom: 16px; }
.cover h1 { font-size: 32px; }
.meta { color: #5E6B80; font-size: 13px; }
.excerpt { color: #334155; }
.post { border-bottom: 1px solid #D7E0EC; margin-bottom: 32px; padding-bottom: 24px; }
</style></head><body>
<header class="cover"><h1>CarnegienFreedom Blog</h1><p>Published articles</p></header>
${articles || '<p>No published posts available.</p>'}
</body></html>`;
}

async function updateDocumentStatus() {
    const posts = await db.getAllPosts();
    const output = document.getElementById('exportDocumentStatus');
    if (output) {
        output.textContent = `${posts.length} published ${posts.length === 1 ? 'post' : 'posts'} ready to download as a document.`;
    }
}

async function downloadDocument() {
    const posts = await db.getAllPosts();
    const documentHTML = buildDocumentHTML(posts);
    const blob = new Blob([documentHTML], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'carnegienfreedom-blog.doc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showNotification('Blog document downloaded.');
}

// ==================== UI UTILITIES ====================

function switchTab(tabName) {
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Find the clicked button and activate it
    const clickedBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (clickedBtn) clickedBtn.classList.add('active');

    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabName + 'Tab').classList.add('active');

    // Refresh data if needed
    if (tabName === 'manage') {
        renderPostsList();
    } else if (tabName === 'export') {
        updateDocumentStatus();
    }
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) {
        overlay.classList.add('show');
    } else {
        overlay.classList.remove('show');
    }
}

function showNotification(message) {
    const notif = document.createElement('div');
    notif.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        background: #3CB54A;
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10001;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        animation: slideIn 0.3s ease;
    `;
    notif.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;

    document.body.appendChild(notif);

    setTimeout(() => {
        notif.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notif.remove(), 300);
    }, 3000);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
    // Check auth
    checkAuth();

    // Setup login form
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    document.getElementById('authSwitch')?.addEventListener('click', toggleAuthMode);
    document.getElementById('togglePassword')?.addEventListener('click', togglePassword);

    document.querySelectorAll('.tab-btn[data-tab]').forEach(button => {
        button.addEventListener('click', () => switchTab(button.dataset.tab));
    });

    document.querySelectorAll('[data-admin-action]').forEach(button => {
        button.addEventListener('click', () => {
            const action = button.dataset.adminAction;
            if (action === 'download-document') downloadDocument();
            if (action === 'logout') logout();
            if (action === 'preview') previewPost();
            if (action === 'clear-form') clearForm();
            if (action === 'close-preview') closePreview();
        });
    });

    document.getElementById('documentFile')?.addEventListener('change', (event) => {
        loadArticleDocument(event.target.files[0]);
    });

    // Add animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-10px); }
            75% { transform: translateX(10px); }
        }
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0); }
        }
    `;
    document.head.appendChild(style);
});

// Make functions globally available
window.togglePassword = togglePassword;
window.logout = logout;
window.switchTab = switchTab;
window.previewPost = previewPost;
window.closePreview = closePreview;
window.clearForm = clearForm;
window.viewPost = viewPost;
window.editPost = editPost;
window.deletePost = deletePost;
window.downloadDocument = downloadDocument;
