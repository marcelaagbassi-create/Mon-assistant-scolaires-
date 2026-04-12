# 📚 Scraper ecole-ci.online → PostgreSQL

Scraper Node.js pour extraire les cours officiels de la Côte d'Ivoire (6ème → Terminale)
du site **https://www.ecole-ci.online** et les stocker dans une base **PostgreSQL**.

---

## 🛠️ Prérequis

- Node.js v16 ou supérieur
- PostgreSQL installé et fonctionnel
- Connexion internet

---

## 📦 Installation

```bash
# 1. Crée le dossier projet
mkdir scraper-ecole-ci && cd scraper-ecole-ci

# 2. Copie scraper.js dans ce dossier

# 3. Initialise le projet Node.js
npm init -y

# 4. Installe les dépendances
npm install puppeteer pg pdf-parse dotenv
```

---

## ⚙️ Configuration

Copie `.env.example` en `.env` et remplis tes infos :

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=scolaire_ci
DB_USER=postgres
DB_PASSWORD=ton_mot_de_passe
```

### Créer la base de données PostgreSQL

```sql
-- Dans psql ou pgAdmin :
CREATE DATABASE scolaire_ci;
```

Le scraper crée automatiquement les tables au premier lancement.

---

## 🚀 Lancement

```bash
node scraper.js
```

---

## 🗄️ Structure de la table `cours`

| Colonne      | Type         | Description                            |
|--------------|--------------|----------------------------------------|
| id           | SERIAL PK    | Identifiant auto-incrémenté            |
| niveau       | VARCHAR(20)  | Ex: "6ème", "Terminale"                |
| matiere      | VARCHAR(100) | Ex: "Mathématiques", "Français"        |
| titre        | TEXT         | Titre du chapitre                      |
| contenu      | TEXT         | Contenu HTML du cours                  |
| image_url    | TEXT         | URL de la première image               |
| source_url   | TEXT UNIQUE  | URL d'origine (évite les doublons)     |
| est_pdf      | BOOLEAN      | TRUE si le cours est un PDF            |
| pdf_url      | TEXT         | URL du PDF à traiter séparément        |
| created_at   | TIMESTAMP    | Date d'insertion                       |
| updated_at   | TIMESTAMP    | Date de mise à jour                    |

---

## 📄 Traitement des PDFs

Les cours au format PDF sont automatiquement logués dans `pdfs_trouves.json`.

Pour les traiter avec `pdf-parse` :

```javascript
const pdfParse = require('pdf-parse');
const fs = require('fs');
const https = require('https');

async function traiterPdf(pdfUrl) {
  // Télécharger le PDF
  const buffer = await new Promise((resolve, reject) => {
    https.get(pdfUrl, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
  });

  // Extraire le texte
  const data = await pdfParse(buffer);
  console.log('Texte extrait :', data.text);
  return data.text;
}
```

---

## ⚙️ Paramètres ajustables dans scraper.js

```javascript
const DELAY_MIN = 3000;  // Délai min entre requêtes (ms)
const DELAY_MAX = 5000;  // Délai max entre requêtes (ms)

// Pour scraper seulement certains niveaux :
const NIVEAUX = [
  { label: 'Terminale', slug: 'terminale' },
  // Commente les autres...
];
```

---

## 🔍 Requêtes SQL utiles après scraping

```sql
-- Voir tous les cours par niveau
SELECT niveau, COUNT(*) FROM cours GROUP BY niveau;

-- Chercher un cours par mot-clé
SELECT titre, niveau, matiere FROM cours
WHERE titre ILIKE '%dérivation%';

-- Voir les PDFs à traiter
SELECT * FROM cours WHERE est_pdf = TRUE;

-- Voir les erreurs
SELECT * FROM scraper_errors ORDER BY created_at DESC;

-- Cours par matière
SELECT matiere, COUNT(*) FROM cours
GROUP BY matiere ORDER BY COUNT(*) DESC;
```

---

## ⚠️ Note éthique

Ce scraper est conçu dans un but éducatif, pour un usage personnel.
Il respecte le serveur en ajoutant des délais entre chaque requête (3-5 secondes).
Respecte les conditions d'utilisation du site.
