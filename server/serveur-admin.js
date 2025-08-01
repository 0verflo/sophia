if (btnCompareVersions) {
                btnCompareVersions.addEventListener('click', compareVersions);
            }
            
            if (btnSyncToClient) {
                btnSyncToClient.addEventListener('click', syncToClient);
            }
            
            if (btnAddQuestion) {
                btnAddQuestion.addEventListener('click', () => showQuestionModal(false));
            }
            
            if (btnCancelQuestion) {
                btnCancelQuestion.addEventListener('click', hideQuestionModal);
            }
            
            if (btnAddOption) {
                btnAddOption.addEventListener('click', () => addOptionField());
            }
            
            if (btnAddIngredient) {
                btnAddIngredient.addEventListener('click', () => addIngredientField());
            }
            
            if (btnAddCategorisation) {
                btnAddCategorisation.addEventListener('click', () => addCategorisationField());
            }            const btnAddQuestion = document.getElementById('btn-add-question');
            const btnCancelQuestion = document.getElementById('btn-cancel-question');
            const btnAddOption = document.getElementById('btn-add-option');
            const btnAddIngredient = document.getElementById('btn-add-ingredient');
            const btnAddCategorisation = document.getElementById('btn-add-categorisation');
            
            if (btnAddProduct) {
                btnAddProduct.addEventListener('click', showAddProductModal);
            }
            
            if (btnRefresh) {
                btnRefresh.addEventListener('click', refreshStatus);
            }
            
            if (btnDownload) {
                btnDownload.addEventListener('click', downloadBackup);
            }
            
            if (btnCancelProduct) {
                btnCancelProduct.addEventListener('click', hideAddProductModal);
            }
            
                    // Actualiser le statut
        function refreshStatus() {
            loadStatus();
            loadProducts();
            loadQuestions();
            loadLogs();
            showNotification('Statut actualisé', 'success');
        }const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3001;

// Configuration
const CONFIG = {
    DATABASE_FILE: './database.json',
    BACKUP_DIR: './backups',
    ALLOWED_ORIGINS: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8080', '*']
};

// Middleware
app.use(cors({
    origin: CONFIG.ALLOWED_ORIGINS,
    credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Logs système
const logAction = (action, details = {}) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${action}:`, details);
};

// Vérification et création des dossiers nécessaires
const initializeDirectories = async () => {
    try {
        await fs.access(CONFIG.BACKUP_DIR);
    } catch {
        await fs.mkdir(CONFIG.BACKUP_DIR, { recursive: true });
        logAction('INIT', { message: 'Dossier de sauvegarde créé' });
    }
};

// Fonction de sauvegarde
const createBackup = async () => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(CONFIG.BACKUP_DIR, `database-backup-${timestamp}.json`);
        
        const currentData = await fs.readFile(CONFIG.DATABASE_FILE, 'utf8');
        await fs.writeFile(backupFile, currentData);
        
        logAction('BACKUP_CREATED', { file: backupFile });
        return backupFile;
    } catch (error) {
        logAction('BACKUP_ERROR', { error: error.message });
        throw error;
    }
};

// Fonction de synchronisation avec le client
const syncToClient = async (clientPath) => {
    try {
        const serverData = await fs.readFile(CONFIG.DATABASE_FILE, 'utf8');
        const serverJson = JSON.parse(serverData);
        
        // Vérifier si le fichier client existe
        let clientData, clientJson;
        try {
            clientData = await fs.readFile(clientPath, 'utf8');
            clientJson = JSON.parse(clientData);
        } catch (error) {
            // Le fichier client n'existe pas, on va le créer
            clientJson = { lastUpdated: '1970-01-01T00:00:00.000Z' };
            logAction('CLIENT_FILE_NOT_FOUND', { path: clientPath });
        }
        
        // Comparer les timestamps de lastUpdated
        const serverTimestamp = new Date(serverJson.lastUpdated || '1970-01-01T00:00:00.000Z').getTime();
        const clientTimestamp = new Date(clientJson.lastUpdated || '1970-01-01T00:00:00.000Z').getTime();
        
        if (serverTimestamp <= clientTimestamp) {
            logAction('SYNC_TO_CLIENT_NO_CHANGE', { 
                serverLastUpdated: serverJson.lastUpdated,
                clientLastUpdated: clientJson.lastUpdated,
                clientPath 
            });
            return { 
                success: true, 
                updated: false, 
                message: 'Les fichiers sont déjà synchronisés',
                serverLastUpdated: serverJson.lastUpdated,
                clientLastUpdated: clientJson.lastUpdated
            };
        }
        
        // Créer une sauvegarde du fichier client avant modification
        if (clientData) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const clientDir = path.dirname(clientPath);
            const clientFilename = path.basename(clientPath, '.json');
            const backupPath = path.join(clientDir, `${clientFilename}-backup-${timestamp}.json`);
            
            await fs.writeFile(backupPath, clientData);
            logAction('CLIENT_BACKUP_CREATED', { 
                original: clientPath,
                backup: backupPath 
            });
        }
        
        // Copier le fichier serveur vers le client
        await fs.writeFile(clientPath, serverData);
        
        logAction('SYNC_TO_CLIENT_SUCCESS', { 
            serverLastUpdated: serverJson.lastUpdated,
            clientPath,
            questionsCount: Object.keys(serverJson.questions).length,
            productsCount: serverJson.products.length
        });
        
        return { 
            success: true, 
            updated: true, 
            message: `Synchronisation réussie vers ${clientPath}`,
            oldLastUpdated: clientJson.lastUpdated,
            newLastUpdated: serverJson.lastUpdated
        };
        
    } catch (error) {
        logAction('SYNC_TO_CLIENT_ERROR', { 
            error: error.message, 
            clientPath 
        });
        return { 
            success: false, 
            error: error.message 
        };
    }
};

// Fonction de mise à jour manuelle de la base de données
const updateDatabase = async (newData) => {
    try {
        // Créer une sauvegarde avant la mise à jour
        await createBackup();
        
        // Valider les données
        if (!newData.questions || !newData.products) {
            throw new Error('Format de données invalide');
        }
        
        // Mettre à jour le timestamp et incrémenter la version
        newData.lastUpdated = new Date().toISOString();
        
        // Auto-incrémenter la version si pas fournie
        if (!newData.version) {
            try {
                const currentData = JSON.parse(await fs.readFile(CONFIG.DATABASE_FILE, 'utf8'));
                const versionParts = currentData.version.split('.');
                versionParts[2] = String(parseInt(versionParts[2]) + 1);
                newData.version = versionParts.join('.');
            } catch {
                newData.version = '1.0.1';
            }
        }
        
        // Écrire les nouvelles données
        await fs.writeFile(CONFIG.DATABASE_FILE, JSON.stringify(newData, null, 2));
        
        logAction('DATABASE_UPDATED', { 
            version: newData.version,
            questionsCount: Object.keys(newData.questions).length,
            productsCount: newData.products.length
        });
        
        return newData;
    } catch (error) {
        logAction('UPDATE_ERROR', { error: error.message });
        throw error;
    }
};

// Routes API

// Obtenir le statut actuel
app.get('/api/status', async (req, res) => {
    try {
        const data = JSON.parse(await fs.readFile(CONFIG.DATABASE_FILE, 'utf8'));
        res.json({
            version: data.version,
            lastUpdated: data.lastUpdated,
            questionsCount: Object.keys(data.questions).length,
            productsCount: data.products.length,
            status: 'active'
        });
    } catch (error) {
        res.status(500).json({ 
            error: error.message,
            status: 'error'
        });
    }
});

// Mettre à jour la base de données
app.post('/api/update', async (req, res) => {
    try {
        const result = await updateDatabase(req.body);
        res.json({ 
            success: true, 
            message: 'Base de données mise à jour avec succès',
            version: result.version,
            updated: true
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Ajouter un produit
app.post('/api/products', async (req, res) => {
    try {
        const data = JSON.parse(await fs.readFile(CONFIG.DATABASE_FILE, 'utf8'));
        const newProduct = {
            id: req.body.id || 'product-' + Date.now(),
            nom: req.body.nom || '',
            informations_generales: {
                indications: req.body.informations_generales?.indications || '',
                contre_indications: req.body.informations_generales?.contre_indications || '',
                caracteristiques: req.body.informations_generales?.caracteristiques || '',
                bibliographie: req.body.informations_generales?.bibliographie || '',
                presentation: req.body.informations_generales?.presentation || '',
                mode_emploi: req.body.informations_generales?.mode_emploi || '',
                recommandations_precautions: req.body.informations_generales?.recommandations_precautions || '',
                conservation: req.body.informations_generales?.conservation || '',
                pourcentage_reconstitution: req.body.informations_generales?.pourcentage_reconstitution || '',
                lieux_vente: req.body.informations_generales?.lieux_vente || '',
                fabricant: req.body.informations_generales?.fabricant || ''
            },
            ingredients: req.body.ingredients || [],
            categorisation: req.body.categorisation || [],
            image: req.body.image || '📦'
        };
        
        data.products.push(newProduct);
        const result = await updateDatabase(data);
        
        res.json({ 
            success: true, 
            message: 'Produit ajouté avec succès',
            product: newProduct,
            version: result.version
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Ajouter une question
app.post('/api/questions', async (req, res) => {
    try {
        const data = JSON.parse(await fs.readFile(CONFIG.DATABASE_FILE, 'utf8'));
        const newQuestion = {
            id: req.body.id || 'q' + (Object.keys(data.questions).length + 1),
            ...req.body
        };
        
        // Valider la structure de la question
        if (!newQuestion.title || !newQuestion.question || !newQuestion.options) {
            return res.status(400).json({ 
                success: false, 
                error: 'Structure de question invalide (title, question, options requis)' 
            });
        }
        
        data.questions[newQuestion.id] = newQuestion;
        const result = await updateDatabase(data);
        
        res.json({ 
            success: true, 
            message: 'Question ajoutée avec succès',
            question: newQuestion,
            version: result.version
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Modifier une question
app.put('/api/questions/:id', async (req, res) => {
    try {
        const data = JSON.parse(await fs.readFile(CONFIG.DATABASE_FILE, 'utf8'));
        const questionId = req.params.id;
        
        if (!data.questions[questionId]) {
            return res.status(404).json({ success: false, error: 'Question non trouvée' });
        }
        
        // Mettre à jour la question
        data.questions[questionId] = {
            ...data.questions[questionId],
            ...req.body,
            id: questionId // Préserver l'ID
        };
        
        const result = await updateDatabase(data);
        
        res.json({ 
            success: true, 
            message: 'Question modifiée avec succès',
            question: data.questions[questionId],
            version: result.version
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Supprimer une question
app.delete('/api/questions/:id', async (req, res) => {
    try {
        const data = JSON.parse(await fs.readFile(CONFIG.DATABASE_FILE, 'utf8'));
        const questionId = req.params.id;
        
        if (!data.questions[questionId]) {
            return res.status(404).json({ success: false, error: 'Question non trouvée' });
        }
        
        delete data.questions[questionId];
        const result = await updateDatabase(data);
        
        res.json({ 
            success: true, 
            message: 'Question supprimée avec succès',
            version: result.version
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
app.delete('/api/products/:id', async (req, res) => {
    try {
        const data = JSON.parse(await fs.readFile(CONFIG.DATABASE_FILE, 'utf8'));
        const productIndex = data.products.findIndex(p => p.id === req.params.id);
        
        if (productIndex === -1) {
            return res.status(404).json({ success: false, error: 'Produit non trouvé' });
        }
        
        data.products.splice(productIndex, 1);
        const result = await updateDatabase(data);
        
        res.json({ 
            success: true, 
            message: 'Produit supprimé avec succès',
            version: result.version
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Synchroniser avec le client
app.post('/api/sync-to-client', async (req, res) => {
    try {
        const { clientPath } = req.body;
        
        console.log('Synchronisation demandée vers:', clientPath); // Debug
        
        if (!clientPath) {
            return res.status(400).json({ 
                success: false, 
                error: 'Chemin du fichier client requis' 
            });
        }
        
        // Valider que le chemin est sécurisé - être plus permissif avec les chemins relatifs
        const normalizedPath = path.normalize(clientPath);
        console.log('Chemin normalisé:', normalizedPath); // Debug
        
        // Permettre les chemins relatifs avec ../ mais bloquer les tentatives malveillantes
        if (normalizedPath.includes('..') && !normalizedPath.startsWith('../')) {
            console.log('Chemin rejeté pour sécurité:', normalizedPath); // Debug
            return res.status(400).json({ 
                success: false, 
                error: 'Chemin de fichier potentiellement dangereux: ' + normalizedPath 
            });
        }
        
        const result = await syncToClient(normalizedPath);
        console.log('Résultat synchronisation:', result); // Debug
        res.json(result);
    } catch (error) {
        console.error('Erreur synchronisation:', error); // Debug
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Comparer les versions serveur/client
app.post('/api/compare-versions', async (req, res) => {
    try {
        const { clientPath } = req.body;
        
        console.log('Comparaison demandée pour:', clientPath); // Debug
        
        if (!clientPath) {
            return res.status(400).json({ 
                success: false, 
                error: 'Chemin du fichier client requis' 
            });
        }
        
        const serverData = JSON.parse(await fs.readFile(CONFIG.DATABASE_FILE, 'utf8'));
        
        let clientData;
        try {
            const normalizedPath = path.normalize(clientPath);
            console.log('Lecture du fichier client:', normalizedPath); // Debug
            clientData = JSON.parse(await fs.readFile(normalizedPath, 'utf8'));
        } catch (error) {
            console.log('Fichier client non trouvé:', error.message); // Debug
            return res.json({
                success: true,
                serverVersion: serverData.version,
                clientVersion: 'Fichier non trouvé',
                serverLastUpdated: serverData.lastUpdated,
                clientLastUpdated: null,
                needsSync: true
            });
        }
        
        // Comparer les timestamps de lastUpdated au lieu des versions
        const serverTimestamp = new Date(serverData.lastUpdated || '1970-01-01T00:00:00.000Z').getTime();
        const clientTimestamp = new Date(clientData.lastUpdated || '1970-01-01T00:00:00.000Z').getTime();
        const needsSync = serverTimestamp > clientTimestamp;
        
        const result = {
            success: true,
            serverVersion: serverData.version,
            clientVersion: clientData.version,
            serverLastUpdated: serverData.lastUpdated,
            clientLastUpdated: clientData.lastUpdated,
            needsSync: needsSync
        };
        
        console.log('Résultat comparaison basée sur lastUpdated:', {
            serverTimestamp,
            clientTimestamp,
            needsSync,
            serverLastUpdated: serverData.lastUpdated,
            clientLastUpdated: clientData.lastUpdated
        }); // Debug
        
        res.json(result);
    } catch (error) {
        console.error('Erreur comparaison:', error); // Debug
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Obtenir les logs récents
app.get('/api/logs', async (req, res) => {
    try {
        // Ici on pourrait lire un vrai fichier de logs
        // Pour l'instant, simulation avec les dernières actions
        const logs = [
            { timestamp: new Date().toISOString(), action: 'SYSTEM_ACTIVE', message: 'Système opérationnel' },
            { timestamp: new Date(Date.now() - 300000).toISOString(), action: 'DATABASE_LOADED', message: 'Base de données chargée' },
            { timestamp: new Date(Date.now() - 600000).toISOString(), action: 'SERVER_START', message: 'Serveur démarré' }
        ];
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Endpoint pour servir la base de données (pour les clients)
app.get('/database.json', async (req, res) => {
    try {
        const data = await fs.readFile(CONFIG.DATABASE_FILE, 'utf8');
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(data);
    } catch (error) {
        res.status(500).json({ error: 'Database not found' });
    }
});

// Interface web d'administration
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Administration - Chatbot Lait Maternel</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        .status-indicator { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        .modal { display: none; }
        .modal.active { display: flex; }
    </style>
</head>
<body class="bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen">
    <div class="container mx-auto px-4 py-8">
        <header class="text-center mb-8">
            <h1 class="text-3xl font-bold text-gray-800 mb-2">🔧 Administration Chatbot</h1>
            <p class="text-gray-600">Gestion des données du chatbot lait maternel</p>
        </header>

        <div class="max-w-4xl mx-auto grid gap-6">
            <!-- Statut du système -->
            <div class="bg-white rounded-lg shadow-lg p-6">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-xl font-semibold text-gray-800">📊 Statut du système</h2>
                    <div class="flex items-center space-x-2">
                        <div class="w-3 h-3 bg-green-500 rounded-full status-indicator"></div>
                        <span class="text-sm text-green-600">Actif</span>
                    </div>
                </div>
                <div id="status-content" class="space-y-2">
                    <p class="text-gray-600">Chargement du statut...</p>
                </div>
            </div>

            <!-- Actions rapides -->
            <div class="bg-white rounded-lg shadow-lg p-6">
                <h2 class="text-xl font-semibold text-gray-800 mb-4">⚡ Actions rapides</h2>
                <div class="grid md:grid-cols-3 gap-4">
                    <button 
                        id="btn-add-product"
                        class="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                    >
                        ➕ Ajouter un produit
                    </button>
                    <button 
                        id="btn-refresh"
                        class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                    >
                        🔄 Actualiser le statut
                    </button>
                    <button 
                        id="btn-download"
                        class="bg-purple-500 hover:bg-purple-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                    >
                        💾 Télécharger sauvegarde
                    </button>
                </div>
            </div>

            <!-- Liste des produits -->
            <div class="bg-white rounded-lg shadow-lg p-6">
                <h2 class="text-xl font-semibold text-gray-800 mb-4">📦 Produits actuels</h2>
                <div id="products-list" class="space-y-2">
                    <p class="text-gray-600">Chargement des produits...</p>
                </div>
            </div>

            <!-- Gestion des questions -->
            <div class="bg-white rounded-lg shadow-lg p-6">
                <h2 class="text-xl font-semibold text-gray-800 mb-4">❓ Gestion des questions</h2>
                <div class="mb-4">
                    <button 
                        id="btn-add-question"
                        class="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                        ➕ Ajouter une question
                    </button>
                </div>
                <div id="questions-list" class="space-y-3">
                    <p class="text-gray-600">Chargement des questions...</p>
                </div>
            </div>
            <div class="bg-white rounded-lg shadow-lg p-6">
                <h2 class="text-xl font-semibold text-gray-800 mb-4">🔄 Synchronisation Client</h2>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Chemin du fichier client database.json</label>
                        <input 
                            type="text" 
                            id="client-path-input" 
                            placeholder="../client/database.json"
                            class="w-full border rounded-lg px-3 py-2 text-sm"
                            value="../client/database.json"
                        >
                        <p class="text-xs text-gray-500 mt-1">Chemin relatif depuis le dossier serveur</p>
                    </div>
                    
                    <div id="version-comparison" class="bg-gray-50 rounded-lg p-4 hidden">
                        <h4 class="font-medium text-gray-800 mb-2">Comparaison des versions</h4>
                        <div id="version-details" class="space-y-1 text-sm"></div>
                    </div>
                    
                    <div class="flex space-x-3">
                        <button 
                            id="btn-compare-versions"
                            class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                        >
                            📊 Comparer les versions
                        </button>
                        <button 
                            id="btn-sync-to-client"
                            class="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                        >
                            ⬇️ Synchroniser vers le client
                        </button>
                    </div>
                </div>
            </div>

            <!-- Logs récents -->
            <div class="bg-white rounded-lg shadow-lg p-6">
                <h2 class="text-xl font-semibold text-gray-800 mb-4">📝 Logs récents</h2>
                <div id="logs-content" class="space-y-2 max-h-64 overflow-y-auto">
                    <p class="text-gray-600">Chargement des logs...</p>
                </div>
            </div>

            <!-- Configuration -->
            <div class="bg-white rounded-lg shadow-lg p-6">
                <h2 class="text-xl font-semibold text-gray-800 mb-4">⚙️ Configuration</h2>
                <div class="space-y-3 text-sm">
                    <div class="flex justify-between">
                        <span class="text-gray-600">Gestion:</span>
                        <span class="font-medium">Manuelle via interface</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">Port serveur:</span>
                        <span class="font-medium">${PORT}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">Sauvegardes:</span>
                        <span class="font-medium">Automatiques avant modifications</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Modal Ajouter/Modifier Question -->
    <div id="question-modal" class="modal fixed inset-0 bg-black bg-opacity-50 items-center justify-center z-50">
        <div class="bg-white rounded-lg p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 id="question-modal-title" class="text-xl font-semibold mb-4">➕ Ajouter une nouvelle question</h3>
            <form id="question-form" class="space-y-4">
                <input type="hidden" id="question-id" name="id">
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">ID de la question</label>
                    <input type="text" id="question-id-display" name="id-display" placeholder="q1, q2, etc." required class="w-full border rounded-lg px-3 py-2">
                    <p class="text-xs text-gray-500 mt-1">Identifiant unique pour la question (ex: q1, q2, q3...)</p>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Titre de la question</label>
                    <input type="text" name="title" placeholder="ex: Âge de votre bébé" required class="w-full border rounded-lg px-3 py-2">
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Question</label>
                    <textarea name="question" rows="2" placeholder="ex: Quel âge a votre bébé ?" required class="w-full border rounded-lg px-3 py-2"></textarea>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Options de réponse</label>
                    <div id="options-container" class="space-y-2">
                        <!-- Options ajoutées dynamiquement -->
                    </div>
                    <button type="button" id="btn-add-option" class="mt-2 bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm">
                        ➕ Ajouter une option
                    </button>
                </div>
                
                <div class="flex space-x-3">
                    <button type="submit" id="btn-submit-question" class="flex-1 bg-indigo-500 text-white py-2 rounded-lg hover:bg-indigo-600">
                        ✅ Enregistrer
                    </button>
                    <button type="button" id="btn-cancel-question" class="flex-1 bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600">
                        ❌ Annuler
                    </button>
                </div>
            </form>
        </div>
    </div>

    <!-- Modal Ajouter/Modifier Produit -->
    <div id="add-product-modal" class="modal fixed inset-0 bg-black bg-opacity-50 items-center justify-center z-50">
        <div class="bg-white rounded-lg p-8 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 id="product-modal-title" class="text-xl font-semibold mb-4">➕ Ajouter un nouveau produit</h3>
            <form id="add-product-form" class="space-y-6">
                <input type="hidden" id="product-id-hidden" name="id">
                
                <!-- Informations de base -->
                <div class="grid md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">ID du produit</label>
                        <input type="text" id="product-id-display" placeholder="product-123" required class="w-full border rounded-lg px-3 py-2">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Nom du produit</label>
                        <input type="text" name="nom" placeholder="ex: Aptamil Pronutra 1" required class="w-full border rounded-lg px-3 py-2">
                    </div>
                </div>

                <!-- Image -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Image (emoji)</label>
                    <input type="text" name="image" placeholder="ex: 👶, 🍼, 🛡️" class="w-full border rounded-lg px-3 py-2">
                </div>

                <!-- Informations générales -->
                <div class="border rounded-lg p-4 bg-gray-50">
                    <h4 class="font-semibold text-gray-800 mb-3">📋 Informations générales</h4>
                    <div class="grid md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Indications</label>
                            <textarea name="indications" rows="2" class="w-full border rounded-lg px-3 py-2"></textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Contre-indications</label>
                            <textarea name="contre_indications" rows="2" class="w-full border rounded-lg px-3 py-2"></textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Caractéristiques</label>
                            <textarea name="caracteristiques" rows="2" class="w-full border rounded-lg px-3 py-2"></textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Bibliographie</label>
                            <textarea name="bibliographie" rows="2" class="w-full border rounded-lg px-3 py-2"></textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Présentation</label>
                            <textarea name="presentation" rows="2" class="w-full border rounded-lg px-3 py-2"></textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Mode d'emploi</label>
                            <textarea name="mode_emploi" rows="2" class="w-full border rounded-lg px-3 py-2"></textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Recommandations et précautions</label>
                            <textarea name="recommandations_precautions" rows="2" class="w-full border rounded-lg px-3 py-2"></textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Conservation</label>
                            <textarea name="conservation" rows="2" class="w-full border rounded-lg px-3 py-2"></textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">% Reconstitution</label>
                            <input type="text" name="pourcentage_reconstitution" class="w-full border rounded-lg px-3 py-2">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Lieux de vente</label>
                            <textarea name="lieux_vente" rows="2" class="w-full border rounded-lg px-3 py-2"></textarea>
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm font-medium text-gray-700 mb-1">Fabricant</label>
                            <input type="text" name="fabricant" class="w-full border rounded-lg px-3 py-2">
                        </div>
                    </div>
                </div>

                <!-- Ingrédients -->
                <div class="border rounded-lg p-4 bg-blue-50">
                    <h4 class="font-semibold text-gray-800 mb-3">🧪 Ingrédients</h4>
                    <div id="ingredients-container" class="space-y-2">
                        <!-- Ingrédients ajoutés dynamiquement -->
                    </div>
                    <button type="button" id="btn-add-ingredient" class="mt-2 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm">
                        ➕ Ajouter un ingrédient
                    </button>
                </div>

                <!-- Catégorisation -->
                <div class="border rounded-lg p-4 bg-green-50">
                    <h4 class="font-semibold text-gray-800 mb-3">🏷️ Catégorisation (pour les résultats du chatbot)</h4>
                    <div id="categorisation-container" class="space-y-2">
                        <!-- Catégorisations ajoutées dynamiquement -->
                    </div>
                    <button type="button" id="btn-add-categorisation" class="mt-2 bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm">
                        ➕ Ajouter une catégorisation
                    </button>
                    <p class="text-xs text-gray-600 mt-2">
                        Ajoutez les valeurs correspondant aux réponses possibles des questions du chatbot (ex: "0-6months", "allergies", "normal", etc.)
                    </p>
                </div>
                
                <div class="flex space-x-3">
                    <button type="submit" id="btn-submit-product" class="flex-1 bg-green-500 text-white py-2 rounded-lg hover:bg-green-600">
                        ✅ Enregistrer
                    </button>
                    <button type="button" id="btn-cancel-product" class="flex-1 bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600">
                        ❌ Annuler
                    </button>
                </div>
            </form>
        </div>
    </div>

    <script>
        // Variables globales
        let isLoading = false;

        // Fonctions utilitaires
        function showNotification(message, type = 'info') {
            const notification = document.createElement('div');
            const bgColor = type === 'success' ? 'bg-green-500' : 
                           type === 'error' ? 'bg-red-500' : 'bg-blue-500';
            notification.className = 'fixed top-4 right-4 px-6 py-3 rounded-lg text-white z-50 ' + bgColor;
            notification.textContent = message;
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.remove();
            }, 5000);
        }

        // Charger le statut
        async function loadStatus() {
            try {
                const response = await fetch('/api/status');
                const data = await response.json();
                
                const statusHtml = '<div class="grid md:grid-cols-2 gap-4 text-sm">' +
                    '<div><span class="text-gray-600">Version:</span><span class="font-medium ml-2">' + data.version + '</span></div>' +
                    '<div><span class="text-gray-600">Dernière MAJ:</span><span class="font-medium ml-2">' + new Date(data.lastUpdated).toLocaleString('fr-FR') + '</span></div>' +
                    '<div><span class="text-gray-600">Questions:</span><span class="font-medium ml-2">' + data.questionsCount + '</span></div>' +
                    '<div><span class="text-gray-600">Produits:</span><span class="font-medium ml-2">' + data.productsCount + '</span></div>' +
                    '</div>';
                
                document.getElementById('status-content').innerHTML = statusHtml;
            } catch (error) {
                document.getElementById('status-content').innerHTML = '<p class="text-red-600">Erreur lors du chargement du statut</p>';
            }
        }

        // Charger les produits
        async function loadProducts() {
            try {
                const response = await fetch('/database.json');
                const data = await response.json();
                
                let productsHtml = '';
                for (let i = 0; i < data.products.length; i++) {
                    const product = data.products[i];
                    productsHtml += '<div class="border rounded-lg p-4">' +
                        '<div class="flex justify-between items-start mb-2">' +
                            '<div class="flex items-center space-x-3 flex-1">' +
                                '<span class="text-2xl">' + (product.image || '📦') + '</span>' +
                                '<div>' +
                                    '<div class="font-medium text-gray-800">' + (product.nom || product.name || 'Produit sans nom') + '</div>' +
                                    '<div class="text-sm text-gray-600">' + (product.id || '') + '</div>' +
                                '</div>' +
                            '</div>' +
                            '<div class="flex space-x-2 ml-4">' +
                                '<button data-product-id="' + product.id + '" class="btn-edit-product bg-blue-500 text-white px-2 py-1 rounded text-sm hover:bg-blue-600" title="Modifier">✏️</button>' +
                                '<button data-product-id="' + product.id + '" class="btn-delete-product bg-red-500 text-white px-2 py-1 rounded text-sm hover:bg-red-600" title="Supprimer">🗑️</button>' +
                            '</div>' +
                        '</div>';
                    
                    // Afficher quelques informations clés
                    if (product.informations_generales?.indications) {
                        productsHtml += '<div class="text-xs text-gray-600 mt-1"><strong>Indications:</strong> ' + product.informations_generales.indications.substring(0, 100) + '...</div>';
                    }
                    if (product.categorisation && product.categorisation.length > 0) {
                        productsHtml += '<div class="text-xs text-gray-500 mt-1"><strong>Catégorisation:</strong> ' + product.categorisation.join(', ') + '</div>';
                    }
                    
                    productsHtml += '</div>';
                }
                
                document.getElementById('products-list').innerHTML = productsHtml;
                
                // Attacher les événements
                const editButtons = document.querySelectorAll('.btn-edit-product');
                const deleteButtons = document.querySelectorAll('.btn-delete-product');
                
                editButtons.forEach(button => {
                    button.addEventListener('click', function() {
                        const productId = this.getAttribute('data-product-id');
                        const product = data.products.find(p => p.id === productId);
                        if (product) {
                            editProduct(product);
                        }
                    });
                });
                
                deleteButtons.forEach(button => {
                    button.addEventListener('click', function() {
                        const productId = this.getAttribute('data-product-id');
                        deleteProduct(productId);
                    });
                });
                
            } catch (error) {
                document.getElementById('products-list').innerHTML = '<p class="text-red-600">Erreur lors du chargement des produits</p>';
            }
        }

        // Charger les questions
        async function loadQuestions() {
            try {
                const response = await fetch('/database.json');
                const data = await response.json();
                
                let questionsHtml = '';
                const questions = Object.values(data.questions);
                
                for (let i = 0; i < questions.length; i++) {
                    const question = questions[i];
                    questionsHtml += '<div class="border rounded-lg p-4">' +
                        '<div class="flex justify-between items-start mb-2">' +
                            '<div class="flex-1">' +
                                '<div class="font-medium text-gray-800">' + question.id + ': ' + question.title + '</div>' +
                                '<div class="text-sm text-gray-600 mt-1">' + question.question + '</div>' +
                            '</div>' +
                            '<div class="flex space-x-2 ml-4">' +
                                '<button data-question-id="' + question.id + '" class="btn-edit-question bg-blue-500 text-white px-2 py-1 rounded text-sm hover:bg-blue-600" title="Modifier">✏️</button>' +
                                '<button data-question-id="' + question.id + '" class="btn-delete-question bg-red-500 text-white px-2 py-1 rounded text-sm hover:bg-red-600" title="Supprimer">🗑️</button>' +
                            '</div>' +
                        '</div>' +
                        '<div class="text-xs text-gray-500">' +
                            '<strong>Options:</strong> ' + question.options.map(opt => opt.label + ' → ' + opt.next).join(' | ') +
                        '</div>' +
                    '</div>';
                }
                
                document.getElementById('questions-list').innerHTML = questionsHtml;
                
                // Attacher les événements
                const editButtons = document.querySelectorAll('.btn-edit-question');
                const deleteButtons = document.querySelectorAll('.btn-delete-question');
                
                editButtons.forEach(button => {
                    button.addEventListener('click', function() {
                        const questionId = this.getAttribute('data-question-id');
                        editQuestion(questionId, data.questions[questionId]);
                    });
                });
                
                deleteButtons.forEach(button => {
                    button.addEventListener('click', function() {
                        const questionId = this.getAttribute('data-question-id');
                        deleteQuestion(questionId);
                    });
                });
                
            } catch (error) {
                document.getElementById('questions-list').innerHTML = '<p class="text-red-600">Erreur lors du chargement des questions</p>';
            }
        }
        async function loadLogs() {
            try {
                const response = await fetch('/api/logs');
                const logs = await response.json();
                
                const logsHtml = logs.map(log => 
                    '<div class="flex justify-between items-center py-2 border-b border-gray-100">' +
                        '<span class="text-sm text-gray-600">' + new Date(log.timestamp).toLocaleString('fr-FR') + '</span>' +
                        '<span class="text-sm font-medium">' + log.action + '</span>' +
                        '<span class="text-sm text-gray-500">' + (log.message || '') + '</span>' +
                    '</div>'
                ).join('');
                
                document.getElementById('logs-content').innerHTML = logsHtml;
            } catch (error) {
                document.getElementById('logs-content').innerHTML = '<p class="text-red-600">Erreur lors du chargement des logs</p>';
            }
        }

        // Gestion des produits
        let ingredientCounter = 0;
        let categorisationCounter = 0;
        
        function showAddProductModal() {
            const modal = document.getElementById('add-product-modal');
            const title = document.getElementById('product-modal-title');
            
            title.textContent = '➕ Ajouter un nouveau produit';
            modal.classList.add('active');
            resetProductForm();
            addIngredientField(); // Ajouter au moins un ingrédient par défaut
            addCategorisationField(); // Ajouter au moins une catégorisation par défaut
        }
        
        function hideAddProductModal() {
            document.getElementById('add-product-modal').classList.remove('active');
            resetProductForm();
        }
        
        function resetProductForm() {
            document.getElementById('add-product-form').reset();
            document.getElementById('product-id-hidden').value = '';
            document.getElementById('ingredients-container').innerHTML = '';
            document.getElementById('categorisation-container').innerHTML = '';
            ingredientCounter = 0;
            categorisationCounter = 0;
        }
        
        function addIngredientField(value = '') {
            ingredientCounter++;
            const container = document.getElementById('ingredients-container');
            const ingredientDiv = document.createElement('div');
            ingredientDiv.className = 'flex space-x-2 items-center ingredient-row';
            ingredientDiv.innerHTML = 
                '<input type="text" placeholder="Nom de l\'ingrédient" value="' + value + '" class="ingredient-name flex-1 border rounded px-2 py-1 text-sm">' +
                '<button type="button" onclick="this.parentElement.remove()" class="bg-red-500 text-white px-2 py-1 rounded text-sm hover:bg-red-600">✕</button>';
            
            container.appendChild(ingredientDiv);
        }
        
        function addCategorisationField(value = '') {
            categorisationCounter++;
            const container = document.getElementById('categorisation-container');
            const categDiv = document.createElement('div');
            categDiv.className = 'flex space-x-2 items-center categorisation-row';
            categDiv.innerHTML = 
                '<input type="text" placeholder="ex: 0-6months, allergies, normal..." value="' + value + '" class="categorisation-value flex-1 border rounded px-2 py-1 text-sm">' +
                '<button type="button" onclick="this.parentElement.remove()" class="bg-red-500 text-white px-2 py-1 rounded text-sm hover:bg-red-600">✕</button>';
            
            container.appendChild(categDiv);
        }
        
        function editProduct(productData) {
            const modal = document.getElementById('add-product-modal');
            const title = document.getElementById('product-modal-title');
            
            title.textContent = '✏️ Modifier le produit';
            modal.classList.add('active');
            
            // Remplir le formulaire
            document.getElementById('product-id-hidden').value = productData.id;
            document.getElementById('product-id-display').value = productData.id;
            document.querySelector('input[name="nom"]').value = productData.nom || productData.name || '';
            document.querySelector('input[name="image"]').value = productData.image || '';
            
            // Informations générales
            const infos = productData.informations_generales || {};
            document.querySelector('textarea[name="indications"]').value = infos.indications || '';
            document.querySelector('textarea[name="contre_indications"]').value = infos.contre_indications || '';
            document.querySelector('textarea[name="caracteristiques"]').value = infos.caracteristiques || '';
            document.querySelector('textarea[name="bibliographie"]').value = infos.bibliographie || '';
            document.querySelector('textarea[name="presentation"]').value = infos.presentation || '';
            document.querySelector('textarea[name="mode_emploi"]').value = infos.mode_emploi || '';
            document.querySelector('textarea[name="recommandations_precautions"]').value = infos.recommandations_precautions || '';
            document.querySelector('textarea[name="conservation"]').value = infos.conservation || '';
            document.querySelector('input[name="pourcentage_reconstitution"]').value = infos.pourcentage_reconstitution || '';
            document.querySelector('textarea[name="lieux_vente"]').value = infos.lieux_vente || '';
            document.querySelector('input[name="fabricant"]').value = infos.fabricant || '';
            
            // Ingrédients
            if (productData.ingredients && productData.ingredients.length > 0) {
                productData.ingredients.forEach(ingredient => {
                    addIngredientField(ingredient);
                });
            } else {
                addIngredientField();
            }
            
            // Catégorisation
            if (productData.categorisation && productData.categorisation.length > 0) {
                productData.categorisation.forEach(categ => {
                    addCategorisationField(categ);
                });
            } else {
                addCategorisationField();
            }
        }
        function showAddProductModal() {
            document.getElementById('add-product-modal').classList.add('active');
        }

        function hideAddProductModal() {
            document.getElementById('add-product-modal').classList.remove('active');
            document.getElementById('add-product-form').reset();
        }

        // Supprimer un produit
        async function deleteProduct(productId) {
            if (!confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) return;

            try {
                const response = await fetch('/api/products/' + productId, {
                    method: 'DELETE'
                });

                const result = await response.json();
                if (result.success) {
                    showNotification('Produit supprimé avec succès!', 'success');
                    loadStatus();
                    loadProducts();
                } else {
                    showNotification('Erreur: ' + result.error, 'error');
                }
            } catch (error) {
                showNotification('Erreur lors de la suppression', 'error');
            }
        }

        // Télécharger sauvegarde
        async function downloadBackup() {
            try {
                const response = await fetch('/database.json');
                const data = await response.json();
                
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'database-backup-' + new Date().toISOString().split('T')[0] + '.json';
                a.click();
                URL.revokeObjectURL(url);
                
                showNotification('Sauvegarde téléchargée!', 'success');
            } catch (error) {
                showNotification('Erreur lors du téléchargement', 'error');
            }
        }

        // Comparer les versions serveur/client
        async function compareVersions() {
            const clientPath = document.getElementById('client-path-input').value.trim();
            
            if (!clientPath) {
                showNotification('Veuillez saisir le chemin du fichier client', 'error');
                return;
            }
            
            try {
                const response = await fetch('/api/compare-versions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clientPath })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    const versionComparison = document.getElementById('version-comparison');
                    const versionDetails = document.getElementById('version-details');
                    
                    let statusColor = result.needsSync ? 'text-orange-600' : 'text-green-600';
                    let statusText = result.needsSync ? 'Synchronisation nécessaire' : 'Fichiers synchronisés';
                    
                    versionDetails.innerHTML = 
                        '<div class="flex justify-between"><span>Version serveur:</span><span class="font-medium">' + result.serverVersion + '</span></div>' +
                        '<div class="flex justify-between"><span>Version client:</span><span class="font-medium">' + result.clientVersion + '</span></div>' +
                        '<div class="flex justify-between"><span>Statut:</span><span class="font-medium ' + statusColor + '">' + statusText + '</span></div>' +
                        '<div class="flex justify-between"><span>Serveur MAJ:</span><span class="text-xs">' + (result.serverLastUpdated ? new Date(result.serverLastUpdated).toLocaleString('fr-FR') : 'N/A') + '</span></div>' +
                        '<div class="flex justify-between"><span>Client MAJ:</span><span class="text-xs">' + (result.clientLastUpdated ? new Date(result.clientLastUpdated).toLocaleString('fr-FR') : 'N/A') + '</span></div>';
                    
                    versionComparison.classList.remove('hidden');
                    
                    const message = result.needsSync ? 
                        'Versions différentes - synchronisation recommandée' : 
                        'Les fichiers sont déjà synchronisés';
                    showNotification(message, result.needsSync ? 'info' : 'success');
                } else {
                    showNotification('Erreur: ' + result.error, 'error');
                }
            } catch (error) {
                showNotification('Erreur lors de la comparaison', 'error');
            }
        }

        // Synchroniser vers le client
        async function syncToClient() {
            const clientPath = document.getElementById('client-path-input').value.trim();
            
            if (!clientPath) {
                showNotification('Veuillez saisir le chemin du fichier client', 'error');
                return;
            }
            
            if (!confirm('Êtes-vous sûr de vouloir synchroniser le fichier client ?\\nUne sauvegarde sera créée automatiquement.')) {
                return;
            }
            
            try {
                const response = await fetch('/api/sync-to-client', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clientPath })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    if (result.updated) {
                        showNotification('Synchronisation réussie! Dernière MAJ: ' + new Date(result.newLastUpdated).toLocaleString('fr-FR'), 'success');
                        // Actualiser la comparaison
                        setTimeout(compareVersions, 1000);
                    } else {
                        showNotification(result.message, 'info');
                    }
                    loadLogs(); // Actualiser les logs
                } else {
                    showNotification('Erreur: ' + result.error, 'error');
                }
            } catch (error) {
                showNotification('Erreur lors de la synchronisation', 'error');
            }
        }

        // Gestion des questions
        let optionCounter = 0;
        
        function showQuestionModal(isEdit = false) {
            const modal = document.getElementById('question-modal');
            const title = document.getElementById('question-modal-title');
            
            title.textContent = isEdit ? '✏️ Modifier la question' : '➕ Ajouter une nouvelle question';
            modal.classList.add('active');
            
            if (!isEdit) {
                resetQuestionForm();
                addOptionField(); // Ajouter au moins une option par défaut
            }
        }
        
        function hideQuestionModal() {
            document.getElementById('question-modal').classList.remove('active');
            resetQuestionForm();
        }
        
        function resetQuestionForm() {
            document.getElementById('question-form').reset();
            document.getElementById('question-id').value = '';
            document.getElementById('options-container').innerHTML = '';
            optionCounter = 0;
        }
        
        function addOptionField(value = '', label = '', next = '') {
            optionCounter++;
            const container = document.getElementById('options-container');
            const optionDiv = document.createElement('div');
            optionDiv.className = 'flex space-x-2 items-center option-row';
            optionDiv.innerHTML = 
                '<input type="text" placeholder="Valeur (ex: 0-6months)" value="' + value + '" class="option-value flex-1 border rounded px-2 py-1 text-sm">' +
                '<input type="text" placeholder="Libellé (ex: 0-6 mois)" value="' + label + '" class="option-label flex-1 border rounded px-2 py-1 text-sm">' +
                '<input type="text" placeholder="Suivant (ex: q2, results)" value="' + next + '" class="option-next flex-1 border rounded px-2 py-1 text-sm">' +
                '<button type="button" onclick="this.parentElement.remove()" class="bg-red-500 text-white px-2 py-1 rounded text-sm hover:bg-red-600">✕</button>';
            
            container.appendChild(optionDiv);
        }
        
        function editQuestion(questionId, questionData) {
            showQuestionModal(true);
            
            // Remplir le formulaire
            document.getElementById('question-id').value = questionId;
            document.getElementById('question-id-display').value = questionId;
            document.querySelector('input[name="title"]').value = questionData.title;
            document.querySelector('textarea[name="question"]').value = questionData.question;
            
            // Ajouter les options existantes
            questionData.options.forEach(option => {
                addOptionField(option.value, option.label, option.next);
            });
        }
        
        async function deleteQuestion(questionId) {
            if (!confirm('Êtes-vous sûr de vouloir supprimer cette question ?\\nCela pourrait affecter le flux du questionnaire.')) return;

            try {
                const response = await fetch('/api/questions/' + questionId, {
                    method: 'DELETE'
                });

                const result = await response.json();
                if (result.success) {
                    showNotification('Question supprimée avec succès!', 'success');
                    loadStatus();
                    loadQuestions();
                } else {
                    showNotification('Erreur: ' + result.error, 'error');
                }
            } catch (error) {
                showNotification('Erreur lors de la suppression', 'error');
            }
        }
        function refreshStatus() {
            loadStatus();
            loadProducts();
            loadLogs();
            showNotification('Statut actualisé', 'success');
        }

        // Initialisation du formulaire d'ajout de produit
        function initializeProductForm() {
            const form = document.getElementById('add-product-form');
            if (form) {
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    const formData = new FormData(e.target);
                    const productData = {
                        name: formData.get('name'),
                        category: formData.get('category'),
                        age: formData.get('age'),
                        price: formData.get('price'),
                        description: formData.get('description'),
                        features: ['Ajouté via interface admin'],
                        indications: ['normal'],
                        details: formData.get('description') || 'Produit ajouté via l interface d administration.'
                    };

                    try {
                        const response = await fetch('/api/products', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(productData)
                        });

                        const result = await response.json();
                        if (result.success) {
                            showNotification('Produit ajouté avec succès! Version: ' + result.version, 'success');
                            hideAddProductModal();
                            loadStatus();
                            loadProducts();
                        } else {
                            showNotification('Erreur: ' + result.error, 'error');
                        }
                    } catch (error) {
                        showNotification('Erreur lors de l ajout du produit', 'error');
                    }
                });
            }
        }

        // Initialisation
        document.addEventListener('DOMContentLoaded', () => {
            console.log('Interface d administration initialisée');
            
            // Définir toutes les fonctions d'initialisation ici
            function initializeProductForm() {
                const form = document.getElementById('add-product-form');
                if (form) {
                    form.addEventListener('submit', async (e) => {
                        e.preventDefault();
                        
                        const formData = new FormData(e.target);
                        const productId = document.getElementById('product-id-hidden').value;
                        const isEdit = productId !== '';
                        
                        // Collecter les ingrédients
                        const ingredientRows = document.querySelectorAll('.ingredient-row');
                        const ingredients = [];
                        ingredientRows.forEach(row => {
                            const name = row.querySelector('.ingredient-name').value.trim();
                            if (name) {
                                ingredients.push(name);
                            }
                        });
                        
                        // Collecter les catégorisations
                        const categorisationRows = document.querySelectorAll('.categorisation-row');
                        const categorisations = [];
                        categorisationRows.forEach(row => {
                            const value = row.querySelector('.categorisation-value').value.trim();
                            if (value) {
                                categorisations.push(value);
                            }
                        });
                        
                        const productData = {
                            id: document.getElementById('product-id-display').value.trim(),
                            nom: formData.get('nom'),
                            informations_generales: {
                                indications: formData.get('indications'),
                                contre_indications: formData.get('contre_indications'),
                                caracteristiques: formData.get('caracteristiques'),
                                bibliographie: formData.get('bibliographie'),
                                presentation: formData.get('presentation'),
                                mode_emploi: formData.get('mode_emploi'),
                                recommandations_precautions: formData.get('recommandations_precautions'),
                                conservation: formData.get('conservation'),
                                pourcentage_reconstitution: formData.get('pourcentage_reconstitution'),
                                lieux_vente: formData.get('lieux_vente'),
                                fabricant: formData.get('fabricant')
                            },
                            ingredients: ingredients,
                            categorisation: categorisations,
                            image: formData.get('image') || '📦'
                        };

                        try {
                            const url = isEdit ? '/api/products/' + productId : '/api/products';
                            const method = isEdit ? 'PUT' : 'POST';
                            
                            const response = await fetch(url, {
                                method: method,
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(productData)
                            });

                            const result = await response.json();
                            if (result.success) {
                                const action = isEdit ? 'modifié' : 'ajouté';
                                showNotification('Produit ' + action + ' avec succès! Version: ' + result.version, 'success');
                                hideAddProductModal();
                                loadStatus();
                                loadProducts();
                            } else {
                                showNotification('Erreur: ' + result.error, 'error');
                            }
                        } catch (error) {
                            showNotification('Erreur lors de l enregistrement', 'error');
                        }
                    });
                }
            }

            function initializeQuestionForm() {
                const form = document.getElementById('question-form');
                if (form) {
                    form.addEventListener('submit', async (e) => {
                        e.preventDefault();
                        
                        const formData = new FormData(e.target);
                        const questionId = document.getElementById('question-id').value;
                        const isEdit = questionId !== '';
                        
                        // Collecter les options
                        const optionRows = document.querySelectorAll('.option-row');
                        const options = [];
                        
                        optionRows.forEach(row => {
                            const value = row.querySelector('.option-value').value.trim();
                            const label = row.querySelector('.option-label').value.trim();
                            const next = row.querySelector('.option-next').value.trim();
                            
                            if (value && label && next) {
                                options.push({ value, label, next });
                            }
                        });
                        
                        if (options.length === 0) {
                            showNotification('Veuillez ajouter au moins une option', 'error');
                            return;
                        }
                        
                        const questionData = {
                            id: document.getElementById('question-id-display').value.trim(),
                            title: formData.get('title'),
                            question: formData.get('question'),
                            options: options
                        };

                        try {
                            const url = isEdit ? '/api/questions/' + questionId : '/api/questions';
                            const method = isEdit ? 'PUT' : 'POST';
                            
                            const response = await fetch(url, {
                                method: method,
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(questionData)
                            });

                            const result = await response.json();
                            if (result.success) {
                                const action = isEdit ? 'modifiée' : 'ajoutée';
                                showNotification('Question ' + action + ' avec succès! Version: ' + result.version, 'success');
                                hideQuestionModal();
                                loadStatus();
                                loadQuestions();
                            } else {
                                showNotification('Erreur: ' + result.error, 'error');
                            }
                        } catch (error) {
                            showNotification('Erreur lors de l enregistrement', 'error');
                        }
                    });
                }
            }
            
            // Attacher les événements aux boutons principaux
            const btnAddProduct = document.getElementById('btn-add-product');
            const btnRefresh = document.getElementById('btn-refresh');
            const btnDownload = document.getElementById('btn-download');
            const btnCancelProduct = document.getElementById('btn-cancel-product');
            const btnCompareVersions = document.getElementById('btn-compare-versions');
            const btnSyncToClient = document.getElementById('btn-sync-to-client');
            const btnAddQuestion = document.getElementById('btn-add-question');
            const btnCancelQuestion = document.getElementById('btn-cancel-question');
            const btnAddOption = document.getElementById('btn-add-option');
            
            if (btnAddProduct) {
                btnAddProduct.addEventListener('click', showAddProductModal);
            }
            
            if (btnRefresh) {
                btnRefresh.addEventListener('click', refreshStatus);
            }
            
            if (btnDownload) {
                btnDownload.addEventListener('click', downloadBackup);
            }
            
            if (btnCancelProduct) {
                btnCancelProduct.addEventListener('click', hideAddProductModal);
            }
            
            if (btnCompareVersions) {
                btnCompareVersions.addEventListener('click', compareVersions);
            }
            
            if (btnSyncToClient) {
                btnSyncToClient.addEventListener('click', syncToClient);
            }
            
            if (btnAddQuestion) {
                btnAddQuestion.addEventListener('click', () => showQuestionModal(false));
            }
            
            if (btnCancelQuestion) {
                btnCancelQuestion.addEventListener('click', hideQuestionModal);
            }
            
            if (btnAddOption) {
                btnAddOption.addEventListener('click', () => addOptionField());
            }
            
            // Charger les données initiales
            loadStatus();
            loadProducts();
            loadQuestions();
            loadLogs();
            
            // Initialiser les formulaires
            initializeProductForm();
            initializeQuestionForm();
            
            // Gérer la fermeture des modals
            const productModal = document.getElementById('add-product-modal');
            const questionModal = document.getElementById('question-modal');
            
            if (productModal) {
                productModal.addEventListener('click', (e) => {
                    if (e.target.id === 'add-product-modal') {
                        hideAddProductModal();
                    }
                });
            }
            
            if (questionModal) {
                questionModal.addEventListener('click', (e) => {
                    if (e.target.id === 'question-modal') {
                        hideQuestionModal();
                    }
                });
            }
            
            // Auto-refresh toutes les 30 secondes
            setInterval(() => {
                loadStatus();
                loadProducts();
                loadQuestions();
            }, 30000);
        });
    </script>
</body>
</html>
    `);
});

// Démarrage du serveur
const startServer = async () => {
    try {
        await initializeDirectories();
        
        app.listen(PORT, () => {
            logAction('SERVER_START', { 
                port: PORT,
                adminUrl: `http://localhost:${PORT}`,
                apiUrl: `http://localhost:${PORT}/api`
            });
            console.log(`\n🚀 Serveur d'administration démarré!`);
            console.log(`📱 Interface web: http://localhost:${PORT}`);
            console.log(`🔗 API: http://localhost:${PORT}/api`);
            console.log(`📝 Gestion manuelle des données via l'interface web\n`);
        });
    } catch (error) {
        logAction('SERVER_ERROR', { error: error.message });
        process.exit(1);
    }
};

startServer();