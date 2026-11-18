use crate::addons::transport;
use crate::domain::{Descriptor, Manifest};
use crate::error::{AppError, Result};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Default)]
pub struct Registry {
    addons: Vec<Descriptor>,
}

impl Registry {
    pub fn load(path: &Path) -> Result<Self> {
        if !path.exists() {
            return Ok(Self::default());
        }
        let raw = fs::read_to_string(path)?;
        let addons: Vec<Descriptor> = serde_json::from_str(&raw).unwrap_or_default();
        Ok(Self { addons })
    }

    pub fn save(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, serde_json::to_string_pretty(&self.addons)?)?;
        Ok(())
    }

    pub fn list(&self) -> Vec<Descriptor> {
        self.addons.clone()
    }

    pub fn find(&self, id: &str) -> Option<&Descriptor> {
        self.addons.iter().find(|item| item.manifest.id == id)
    }

    pub async fn install(&mut self, raw_url: &str) -> Result<Descriptor> {
        let base = normalize_url(raw_url)?;
        assert_safe_url(&base)?;

        let manifest: Manifest = transport::fetch_manifest(&base).await?;
        manifest.validate()?;
        self.reject_conflicting_origin(&manifest, &base)?;

        if let Some(existing) = self
            .addons
            .iter_mut()
            .find(|item| item.manifest.id == manifest.id)
        {
            existing.manifest = manifest.clone();
            existing.transport_url = base;
            return Ok(existing.clone());
        }

        let descriptor = Descriptor {
            manifest,
            transport_url: base,
        };
        self.addons.push(descriptor.clone());
        Ok(descriptor)
    }

    pub fn uninstall(&mut self, id: &str) -> Result<()> {
        let before = self.addons.len();
        self.addons.retain(|item| item.manifest.id != id);
        if self.addons.len() == before {
            return Err(AppError::AddonNotFound(id.into()));
        }
        Ok(())
    }

    /// Um add-on nao pode reivindicar o id de outro origin.
    fn reject_conflicting_origin(&self, manifest: &Manifest, base: &str) -> Result<()> {
        if let Some(existing) = self.find(&manifest.id) {
            if existing.transport_url != base {
                return Err(AppError::InvalidManifest(format!(
                    "id '{}' ja pertence a outro origin",
                    manifest.id
                )));
            }
        }
        Ok(())
    }
}

fn normalize_url(raw: &str) -> Result<String> {
    let trimmed = raw.trim().trim_end_matches('/');
    let base = trimmed.strip_suffix("/manifest.json").unwrap_or(trimmed);

    if !base.starts_with("http://") && !base.starts_with("https://") {
        return Err(AppError::InvalidManifest(
            "URL do manifesto deve comecar com http(s)".into(),
        ));
    }

    Ok(base.to_string())
}

/// Em producao, manifsto nao pode apontar para a rede interna do usuario.
/// Em debug liberamos localhost para o add-on de teste da porta 7000.
fn assert_safe_url(base: &str) -> Result<()> {
    if cfg!(debug_assertions) {
        return Ok(());
    }

    let url = reqwest::Url::parse(base).map_err(|e| AppError::Url(format!("URL invalida: {e}")))?;
    let host = url.host_str().unwrap_or_default().to_lowercase();

    let is_private = host == "localhost"
        || host == "127.0.0.1"
        || host.starts_with("10.")
        || host.starts_with("192.168.")
        || host.starts_with("172.")
        || host.ends_with(".local");

    if is_private {
        return Err(AppError::InvalidManifest(
            "origens privadas nao sao permitidas em producao".into(),
        ));
    }

    Ok(())
}
