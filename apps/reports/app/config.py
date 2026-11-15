from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración del servicio de reportes (solo lectura)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_version: str = "0.1.0"
    reports_cors_origin: str = "http://localhost:3000"
    reports_database_url: str = ""


settings = Settings()
