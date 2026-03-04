# VPS Deployment Guide

## Prerequisites

- A Hetzner VPS (or any Ubuntu/Debian server)
- A domain name (optional, but recommended for HTTPS)
- Your GitHub repo (private or public)

---

## Step 1: Push your code to GitHub

On your local machine:

```bash
cd "C:/Users/shiva/Desktop/STARLINKEE APPS/contact_center_incremental"
git init
git add -A
git commit -m "Initial commit"
```

Go to https://github.com/new and create a new repo (can be private).

```bash
git remote add origin https://github.com/starlinkee/contact-center-incremental.git
git branch -M main
git push -u origin main
```

---

## Step 2: SSH into your VPS

You should have received an IP address and root password from Hetzner when you created the server.

```bash
ssh root@YOUR_VPS_IP
```

If this is your first time, it will ask you to confirm the fingerprint — type `yes`.

---

## Step 3: Install Docker on the VPS

```bash
curl -fsSL https://get.docker.com | sh
```

Verify it works:

```bash
docker --version
```

---

## Step 4: Set up a deploy key so the VPS can clone your private repo

Your VPS needs permission to pull from your GitHub repo. If the repo is **public**, skip to Step 5. For **private repos**, you need a deploy key.

### 4a. Generate an SSH key on the VPS

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""
```

This creates two files:
- `~/.ssh/github_deploy` — the **private key** (stays on the VPS, never share)
- `~/.ssh/github_deploy.pub` — the **public key** (give this to GitHub)

### 4b. Print the public key

```bash
cat ~/.ssh/github_deploy.pub
```

Copy the entire output (starts with `ssh-ed25519 ...`).

### 4c. Add it as a deploy key on GitHub

1. Go to your repo on GitHub
2. **Settings** → **Deploy keys** → **Add deploy key**
3. Title: `VPS Deploy Key`
4. Paste the public key
5. Leave "Allow write access" **unchecked** (read-only is fine)
6. Click **Add key**

### 4d. Configure SSH on the VPS to use this key for GitHub

```bash
cat >> ~/.ssh/config << 'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
EOF

chmod 600 ~/.ssh/config
```

### 4e. Test the connection

```bash
ssh -T git@github.com
```

You should see: `Hi YOUR_USERNAME/contact-center! You've successfully authenticated...`

---

## Step 5: Clone and start the app

```bash
cd ~
git clone https://github.com/starlinkee/contact-center-incremental.git
cd contact-center-incremental
```

> **Note:** If your repo is **private**, use the SSH URL (`git@github.com:starlinkee/contact-center-incremental.git`) and complete Step 4 first. For **public** repos, HTTPS works without any keys.

### Create your .env file

```bash
nano .env
```

Paste this and fill in your real values:

```
PORT=3000
SESSION_SECRET=CHANGE_ME_TO_SOMETHING_RANDOM
APP_PASSWORD=your-login-password
GOOGLE_PLACES_API_KEY=your-google-api-key
SENDGRID_API_KEY=your-sendgrid-api-key
APP_URL=http://YOUR_VPS_IP:3000
```

For `SESSION_SECRET`, generate a random string:

```bash
openssl rand -hex 32
```

Save and exit nano: `Ctrl+O`, `Enter`, `Ctrl+X`.

### Start the app

```bash
docker compose up -d --build
```

This will take a few minutes the first time (building node modules). Once done:

```bash
docker compose logs -f
```

You should see `Server running on http://localhost:3000`. Press `Ctrl+C` to exit logs.

**Your app is now live at `http://YOUR_VPS_IP:3000`.**

---

## Step 6: Set up automatic deploys with GitHub Actions

This makes it so every `git push` to `main` automatically deploys to your VPS.

### 6a. Generate a SEPARATE SSH key for GitHub Actions

Still on the VPS:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_actions -N ""
```

Allow this key to SSH into the VPS:

```bash
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys
```

Print the **private** key (you'll give this to GitHub Actions):

```bash
cat ~/.ssh/github_actions
```

Copy the ENTIRE output, including `-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END OPENSSH PRIVATE KEY-----`.

### 6b. Add secrets to GitHub

Go to your repo on GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

Add these four secrets:

| Secret name    | Value                                                    |
|----------------|----------------------------------------------------------|
| `VPS_HOST`     | Your VPS IP address (e.g. `65.21.123.456`)               |
| `VPS_USER`     | `root`                                                   |
| `VPS_SSH_KEY`  | The entire private key you copied above                  |
| `VPS_PORT`     | `22`                                                     |

### 6c. How it works

The workflow file (`.github/workflows/deploy.yml`) is already set up. When you push to `main`:

1. GitHub Actions SSHs into your VPS using the key
2. Runs `git pull` to get the latest code
3. Rebuilds the Docker container
4. Restarts the app

### 6d. Test it

Make any small change locally, commit, and push:

```bash
git add -A
git commit -m "Test deploy"
git push
```

Go to your repo → **Actions** tab to watch the deployment.

---

## Step 7: Firewall

```bash
ufw allow 22    # SSH
ufw allow 80    # HTTP
ufw allow 443   # HTTPS
ufw enable
```

Type `y` to confirm.

---

## Step 8: HTTPS with nginx (optional but recommended)

You need a domain pointing to your VPS IP first. Add an **A record** in your DNS:

```
Type: A
Name: @ (or subdomain like "leads")
Value: YOUR_VPS_IP
TTL: 300
```

Wait a few minutes for DNS to propagate, then:

```bash
apt install nginx certbot python3-certbot-nginx -y
```

Create the nginx config:

```bash
cat > /etc/nginx/sites-available/leadscraper << 'EOF'
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
```

**Replace `yourdomain.com` with your actual domain.**

Enable the config:

```bash
ln -s /etc/nginx/sites-available/leadscraper /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

Get a free SSL certificate:

```bash
certbot --nginx -d yourdomain.com
```

Follow the prompts (enter your email, agree to terms). Certbot auto-renews.

Update your `.env` to use the domain:

```bash
cd ~/contact-center
sed -i 's|APP_URL=.*|APP_URL=https://yourdomain.com|' .env
docker compose restart
```

The tracking pixel needs the correct APP_URL to work.

---

## SSH Keys Summary

There are **two separate key pairs** used in this setup:

| Key | Lives on | Purpose | Given to |
|-----|----------|---------|----------|
| `~/.ssh/github_deploy` | VPS | VPS pulls code from GitHub | Public key → GitHub **Deploy Keys** |
| `~/.ssh/github_actions` | VPS | GitHub Actions SSHs into VPS | Private key → GitHub **Actions Secrets** |

They serve different purposes:
- **Deploy key**: Lets the VPS authenticate with GitHub to `git pull`
- **Actions key**: Lets GitHub Actions authenticate with the VPS to run deploy commands

---

## Useful Commands

```bash
cd ~/contact-center

docker compose logs -f          # Tail logs
docker compose restart          # Restart
docker compose down             # Stop
docker compose up -d --build    # Rebuild and start
docker compose ps               # Check status

# View the SQLite database
docker compose exec app sh
sqlite3 data/app.db ".tables"
```

## Troubleshooting

**App won't start:** Check logs with `docker compose logs -f`

**Can't clone repo:** Run `ssh -T git@github.com` — if it fails, your deploy key isn't set up correctly

**GitHub Actions deploy fails:** Check the Actions tab on GitHub for error details. Make sure all 4 secrets are set correctly.

**Port 3000 not accessible:** Check firewall with `ufw status`. Make sure port 3000 is allowed (or use nginx on port 80).

**Tracking pixel not working:** Make sure `APP_URL` in `.env` matches your actual URL (including https:// if using SSL).
