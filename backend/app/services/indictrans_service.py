from backend.app.schemas.chat import TranslateResponse


class IndicTransService:
    def translate(self, text: str, source_language: str, target_language: str) -> TranslateResponse:
        return TranslateResponse(
            text=text,
            provider="IndicTrans2",
            is_stub=True,
        )


indictrans_service = IndicTransService()
