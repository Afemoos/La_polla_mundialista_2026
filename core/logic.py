from core.sheets_db import db

def validate_and_submit_principal(email, nombre, marcador_predicho):
    """
    Validaciones para el registro principal
    Returns: (bool, mensaje_error)
    """
    if db.check_if_user_registered("Registro_Principal", email):
        return False, "Ya existe una predicción general registrada para este correo."
    
    # En preparación para Google sheets
    # [Timestamp será añadido automáticamente o podemos usar datetime.now().strftime("%Y-%m-%d %H:%M:%S")]
    from datetime import datetime
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    row = [timestamp, email, nombre, marcador_predicho, "PENDIENTE"]
    db.append_record("Registro_Principal", row)
    
    return True, ""

def validate_and_submit_micro(email, id_partido, marcador_predicho):
    """
    Validaciones para el registro de micro eventos
    Returns: (bool, mensaje_error)
    """
    if db.check_if_user_registered("Micro_Eventos", email, id_partido):
        return False, f"Ya enviaste tu marcador para el evento #{id_partido}."
    
    from datetime import datetime
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    row = [timestamp, email, id_partido, marcador_predicho, "PENDIENTE"]
    db.append_record("Micro_Eventos", row)
    
    return True, ""
