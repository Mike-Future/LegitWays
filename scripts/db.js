const API_ROOT = '/api';
let apiAvailable = false;
let localDataPromise = null;

function loadLocalData() {
    if (!localDataPromise) {
        localDataPromise = fetch('data/blog-data.json').then(response => {
            if (!response.ok) {
                throw new Error(`Unable to load local blog data: ${response.status}`);
            }
            return response.json();
        });
    }
    return localDataPromise;
}

function localPosts() {
    return loadLocalData().then(data => data.posts || []);
}

function localCategories() {
    return loadLocalData().then(data => data.categories || []);
}

async function request(path, options = {}) {
    const response = await fetch(`${API_ROOT}${path}`, {
        headers: {
            'Content-Type': 'application/json'
        },
        credentials: 'same-origin',
        ...options
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`API request failed: ${response.status} ${response.statusText} ${text}`);
    }

    if (response.status === 204) {
        return null;
    }

    return response.json();
}

async function initDB() {
    try {
        await request('/health');
        apiAvailable = true;
    } catch (error) {
        apiAvailable = false;
        console.warn('Blog API unavailable; using local blog data for read operations.', error);
    }

    return {
        getAllPosts,
        getPostBySlug,
        getPostsByCategory,
        getFeaturedPosts,
        savePost,
        deletePost,
        searchPosts,
        getAllCategories,
        saveCategory,
        updateCategoryCounts,
        getSetting,
        saveSetting,
        getPendingAdmins,
        getAdmins,
        approveAdmin,
        revokeAdmin,
        removeAdmin,
        exportAllData,
        importData,
        clearAllData
    };
}

async function getAllPosts() {
    return apiAvailable ? request('/posts') : localPosts();
}

async function getPostBySlug(slug) {
    if (apiAvailable) {
        return request(`/posts/slug/${encodeURIComponent(slug)}`);
    }
    const posts = await localPosts();
    return posts.find(post => post.slug === slug) || null;
}

async function getPostsByCategory(category) {
    if (!category || category === 'all') {
        return getAllPosts();
    }
    return apiAvailable
        ? request(`/posts/category/${encodeURIComponent(category)}`)
        : localPosts().then(posts => posts.filter(post => post.category === category));
}

async function getFeaturedPosts() {
    return apiAvailable
        ? request('/posts/featured')
        : localPosts().then(posts => posts.filter(post => post.featured));
}

async function savePost(post) {
    if (!apiAvailable) {
        throw new Error('The blog database is unavailable. Start the Node.js server and PostgreSQL before publishing.');
    }
    return request('/posts', {
        method: 'POST',
        body: JSON.stringify(post)
    });
}

async function deletePost(id) {
    if (!apiAvailable) {
        throw new Error('The blog database is unavailable. Start the Node.js server and PostgreSQL before deleting posts.');
    }
    return request(`/posts/${encodeURIComponent(id)}`, {
        method: 'DELETE'
    });
}

async function searchPosts(query) {
    const q = String(query || '').trim();
    if (!q) {
        return getAllPosts();
    }
    if (apiAvailable) {
        return request(`/posts/search?q=${encodeURIComponent(q)}`);
    }
    const posts = await localPosts();
    const searchTerm = q.toLowerCase();
    return posts.filter(post => [post.title, post.excerpt, post.categoryLabel, ...(post.tags || [])]
        .some(value => String(value || '').toLowerCase().includes(searchTerm)));
}

async function getAllCategories() {
    return apiAvailable ? request('/categories') : localCategories();
}

async function saveCategory(category) {
    return request('/categories', {
        method: 'POST',
        body: JSON.stringify(category)
    });
}

async function updateCategoryCounts() {
    return request('/categories/update-counts', {
        method: 'POST'
    });
}

async function getSetting(key, defaultValue = null) {
    try {
        return await request(`/settings/${encodeURIComponent(key)}`);
    } catch (error) {
        return defaultValue;
    }
}

async function saveSetting(key, value) {
    return request('/settings', {
        method: 'POST',
        body: JSON.stringify({ key, value })
    });
}

async function getPendingAdmins() {
    return request('/admin/pending');
}

async function getAdmins() {
    return request('/admin');
}

async function approveAdmin(id) {
    return request(`/admin/${encodeURIComponent(id)}/approve`, { method: 'POST' });
}

async function revokeAdmin(id) {
    return request(`/admin/${encodeURIComponent(id)}/revoke`, { method: 'POST' });
}

async function removeAdmin(id) {
    return request(`/admin/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

async function exportAllData() {
    return apiAvailable
        ? request('/data/export')
        : loadLocalData();
}

async function importData(data) {
    return request('/data/import', {
        method: 'POST',
        body: JSON.stringify(data)
    });
}

async function clearAllData() {
    return request('/data/clear', {
        method: 'POST'
    });
}

window.LegitWaysDB = { initDB };
