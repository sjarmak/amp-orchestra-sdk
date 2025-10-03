use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool, FromRow};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ToolboxProfile {
    pub id: i64,
    pub name: String,
    #[serde(skip_serializing)]
    pub created_at: String,
    #[sqlx(skip)]
    #[serde(default)]
    pub paths: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateToolboxProfileRequest {
    pub name: String,
    pub paths: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateToolboxProfileRequest {
    pub id: i64,
    pub name: Option<String>,
    pub paths: Option<Vec<String>>,
}

pub struct ToolboxProfileStore {
    db: SqlitePool,
}

impl ToolboxProfileStore {
    pub fn new(db: SqlitePool) -> Self {
        Self { db }
    }

    pub async fn list_profiles(&self) -> Result<Vec<ToolboxProfile>, sqlx::Error> {
        let profiles = sqlx::query_as::<_, ToolboxProfile>(
            "SELECT id, name, created_at FROM toolbox_profiles ORDER BY created_at DESC"
        )
        .fetch_all(&self.db)
        .await?;

        let mut result = Vec::new();
        for mut profile in profiles {
            profile.paths = self.get_profile_paths(profile.id).await?;
            result.push(profile);
        }

        Ok(result)
    }

    pub async fn get_profile(&self, id: i64) -> Result<Option<ToolboxProfile>, sqlx::Error> {
        let profile = sqlx::query_as::<_, ToolboxProfile>(
            "SELECT id, name, created_at FROM toolbox_profiles WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await?;

        if let Some(mut profile) = profile {
            profile.paths = self.get_profile_paths(profile.id).await?;
            Ok(Some(profile))
        } else {
            Ok(None)
        }
    }

    pub async fn create_profile(&self, request: CreateToolboxProfileRequest) -> Result<ToolboxProfile, sqlx::Error> {
        let mut tx = self.db.begin().await?;

        // Insert profile
        let result = sqlx::query(
            "INSERT INTO toolbox_profiles (name) VALUES (?) RETURNING id"
        )
        .bind(&request.name)
        .fetch_one(&mut *tx)
        .await?;

        let profile_id: i64 = result.get("id");

        // Insert paths
        for (index, path) in request.paths.iter().enumerate() {
            sqlx::query(
                "INSERT INTO toolbox_profile_paths (profile_id, path, order_idx) VALUES (?, ?, ?)"
            )
            .bind(profile_id)
            .bind(path)
            .bind(index as i32)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;

        // Return the created profile
        self.get_profile(profile_id).await.map(|p| p.unwrap())
    }

    pub async fn update_profile(&self, request: UpdateToolboxProfileRequest) -> Result<Option<ToolboxProfile>, sqlx::Error> {
        let mut tx = self.db.begin().await?;

        // Update name if provided
        if let Some(name) = &request.name {
            sqlx::query("UPDATE toolbox_profiles SET name = ? WHERE id = ?")
                .bind(name)
                .bind(request.id)
                .execute(&mut *tx)
                .await?;
        }

        // Update paths if provided
        if let Some(paths) = &request.paths {
            // Delete existing paths
            sqlx::query("DELETE FROM toolbox_profile_paths WHERE profile_id = ?")
                .bind(request.id)
                .execute(&mut *tx)
                .await?;

            // Insert new paths
            for (index, path) in paths.iter().enumerate() {
                sqlx::query(
                    "INSERT INTO toolbox_profile_paths (profile_id, path, order_idx) VALUES (?, ?, ?)"
                )
                .bind(request.id)
                .bind(path)
                .bind(index as i32)
                .execute(&mut *tx)
                .await?;
            }
        }

        tx.commit().await?;

        // Return the updated profile
        self.get_profile(request.id).await
    }

    pub async fn delete_profile(&self, id: i64) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM toolbox_profiles WHERE id = ?")
            .bind(id)
            .execute(&self.db)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    async fn get_profile_paths(&self, profile_id: i64) -> Result<Vec<String>, sqlx::Error> {
        let paths = sqlx::query(
            "SELECT path FROM toolbox_profile_paths WHERE profile_id = ? ORDER BY order_idx"
        )
        .bind(profile_id)
        .fetch_all(&self.db)
        .await?;

        Ok(paths.into_iter().map(|row| row.get::<String, _>("path")).collect())
    }

    pub async fn get_profile_by_name(&self, name: &str) -> Result<Option<ToolboxProfile>, sqlx::Error> {
        let profile = sqlx::query_as::<_, ToolboxProfile>(
            "SELECT id, name, created_at FROM toolbox_profiles WHERE name = ?"
        )
        .bind(name)
        .fetch_optional(&self.db)
        .await?;

        if let Some(mut profile) = profile {
            profile.paths = self.get_profile_paths(profile.id).await?;
            Ok(Some(profile))
        } else {
            Ok(None)
        }
    }

    pub async fn migrate_single_paths(&self) -> Result<(), sqlx::Error> {
        // Get all unique toolbox_path values from chat_sessions
        let paths = sqlx::query(
            "SELECT DISTINCT toolbox_path FROM chat_sessions WHERE toolbox_path IS NOT NULL AND toolbox_path != ''"
        )
        .fetch_all(&self.db)
        .await?;

        for path_row in paths {
            let path: String = path_row.get("toolbox_path");
            
            // Extract basename for profile name
            let profile_name = format!("Migrated - {}", 
                std::path::Path::new(&path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("Unknown")
            );

            // Check if profile already exists
            if self.get_profile_by_name(&profile_name).await?.is_some() {
                continue; // Skip if already migrated
            }

            // Create profile for this path
            let profile = self.create_profile(CreateToolboxProfileRequest {
                name: profile_name,
                paths: vec![path.clone()],
            }).await?;

            // Update chat_sessions to reference the profile
            sqlx::query(
                "UPDATE chat_sessions SET toolbox_profile_id = ? WHERE toolbox_path = ?"
            )
            .bind(profile.id)
            .bind(&path)
            .execute(&self.db)
            .await?;

            // Update runs to reference the profile  
            sqlx::query(
                "UPDATE runs SET toolbox_profile_id = ? WHERE toolbox_path = ?"
            )
            .bind(profile.id)
            .bind(&path)
            .execute(&self.db)
            .await?;
        }

        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::{SqlitePool, sqlite::SqliteConnectOptions, ConnectOptions};
    use std::str::FromStr;

    async fn setup_test_db() -> SqlitePool {
        let options = SqliteConnectOptions::from_str(":memory:")
            .unwrap()
            .create_if_missing(true)
            .disable_statement_logging();
        
        let pool = SqlitePool::connect_with(options).await.unwrap();
        
        // Run migrations
        let migrations = vec![
            include_str!("../migrations/001_initial.sql"),
            include_str!("../migrations/002_chat_sessions.sql"),
            include_str!("../migrations/003_chat_sessions_agent_mode.sql"),
            include_str!("../migrations/004_add_toolbox_profiles.sql"),
        ];
        
        for migration_sql in migrations {
            sqlx::query(migration_sql).execute(&pool).await.unwrap();
        }
        
        pool
    }

    #[tokio::test]
    async fn test_create_profile() {
        let pool = setup_test_db().await;
        let store = ToolboxProfileStore::new(pool);
        
        let request = CreateToolboxProfileRequest {
            name: "Test Profile".to_string(),
            paths: vec!["/path1".to_string(), "/path2".to_string()],
        };
        
        let profile = store.create_profile(request).await.unwrap();
        
        assert_eq!(profile.name, "Test Profile");
        assert_eq!(profile.paths, vec!["/path1", "/path2"]);
        assert_eq!(profile.id, 1);
    }

    #[tokio::test]
    async fn test_list_profiles() {
        let pool = setup_test_db().await;
        let store = ToolboxProfileStore::new(pool);
        
        // Create two profiles
        store.create_profile(CreateToolboxProfileRequest {
            name: "Profile 1".to_string(),
            paths: vec!["/path1".to_string()],
        }).await.unwrap();
        
        store.create_profile(CreateToolboxProfileRequest {
            name: "Profile 2".to_string(),
            paths: vec!["/path2".to_string(), "/path3".to_string()],
        }).await.unwrap();
        
        let profiles = store.list_profiles().await.unwrap();
        
        assert_eq!(profiles.len(), 2);
        assert!(profiles.iter().any(|p| p.name == "Profile 1" && p.paths == vec!["/path1"]));
        assert!(profiles.iter().any(|p| p.name == "Profile 2" && p.paths == vec!["/path2", "/path3"]));
    }

    #[tokio::test]
    async fn test_get_profile() {
        let pool = setup_test_db().await;
        let store = ToolboxProfileStore::new(pool);
        
        let created = store.create_profile(CreateToolboxProfileRequest {
            name: "Test Profile".to_string(),
            paths: vec!["/path1".to_string(), "/path2".to_string()],
        }).await.unwrap();
        
        let retrieved = store.get_profile(created.id).await.unwrap().unwrap();
        
        assert_eq!(retrieved.name, "Test Profile");
        assert_eq!(retrieved.paths, vec!["/path1", "/path2"]);
        assert_eq!(retrieved.id, created.id);
    }

    #[tokio::test]
    async fn test_update_profile() {
        let pool = setup_test_db().await;
        let store = ToolboxProfileStore::new(pool);
        
        let created = store.create_profile(CreateToolboxProfileRequest {
            name: "Original".to_string(),
            paths: vec!["/path1".to_string()],
        }).await.unwrap();
        
        let updated = store.update_profile(UpdateToolboxProfileRequest {
            id: created.id,
            name: Some("Updated".to_string()),
            paths: Some(vec!["/path1".to_string(), "/path2".to_string()]),
        }).await.unwrap().unwrap();
        
        assert_eq!(updated.name, "Updated");
        assert_eq!(updated.paths, vec!["/path1", "/path2"]);
    }

    #[tokio::test]
    async fn test_delete_profile() {
        let pool = setup_test_db().await;
        let store = ToolboxProfileStore::new(pool);
        
        let created = store.create_profile(CreateToolboxProfileRequest {
            name: "To Delete".to_string(),
            paths: vec!["/path1".to_string()],
        }).await.unwrap();
        
        let deleted = store.delete_profile(created.id).await.unwrap();
        assert!(deleted);
        
        let retrieved = store.get_profile(created.id).await.unwrap();
        assert!(retrieved.is_none());
    }

    #[tokio::test]
    async fn test_get_profile_by_name() {
        let pool = setup_test_db().await;
        let store = ToolboxProfileStore::new(pool);
        
        store.create_profile(CreateToolboxProfileRequest {
            name: "Unique Name".to_string(),
            paths: vec!["/path1".to_string()],
        }).await.unwrap();
        
        let found = store.get_profile_by_name("Unique Name").await.unwrap().unwrap();
        assert_eq!(found.name, "Unique Name");
        
        let not_found = store.get_profile_by_name("Not Exist").await.unwrap();
        assert!(not_found.is_none());
    }

    #[tokio::test]
    async fn test_path_ordering() {
        let pool = setup_test_db().await;
        let store = ToolboxProfileStore::new(pool);
        
        let created = store.create_profile(CreateToolboxProfileRequest {
            name: "Ordered Profile".to_string(),
            paths: vec!["/first".to_string(), "/second".to_string(), "/third".to_string()],
        }).await.unwrap();
        
        // Verify order is preserved
        assert_eq!(created.paths, vec!["/first", "/second", "/third"]);
        
        // Update with different order
        let updated = store.update_profile(UpdateToolboxProfileRequest {
            id: created.id,
            name: None,
            paths: Some(vec!["/third".to_string(), "/first".to_string()]),
        }).await.unwrap().unwrap();
        
        assert_eq!(updated.paths, vec!["/third", "/first"]);
    }

    #[tokio::test]
    async fn test_migrate_single_paths() {
        let pool = setup_test_db().await;
        let store = ToolboxProfileStore::new(pool.clone());
        
        // Insert some test data into chat_sessions with toolbox_path
        sqlx::query("INSERT INTO chat_sessions (id, context, toolbox_path) VALUES ('session1', 'test', '/old/path1'), ('session2', 'test', '/old/path2')")
            .execute(&pool)
            .await
            .unwrap();
        
        // Run migration
        store.migrate_single_paths().await.unwrap();
        
        // Check that profiles were created
        let profiles = store.list_profiles().await.unwrap();
        assert_eq!(profiles.len(), 2);
        
        // Check that one of the profiles has the right path
        let profile1 = profiles.iter().find(|p| p.paths.contains(&"/old/path1".to_string())).unwrap();
        assert!(profile1.name.starts_with("Migrated -"));
        
        // Check that chat_sessions were updated
        let rows = sqlx::query("SELECT toolbox_profile_id FROM chat_sessions WHERE id = 'session1'")
            .fetch_one(&pool)
            .await
            .unwrap();
        
        let profile_id: Option<i64> = rows.try_get("toolbox_profile_id").unwrap();
        assert!(profile_id.is_some());
    }
}
