from flask import Blueprint, jsonify, request
from .services import run_gauntlet_evaluation, GAUNTLETS

bp = Blueprint('api', __name__, url_prefix='/api')

# --- NEW: Endpoint to get the list of gauntlets ---
@bp.route('/gauntlets', methods=['GET'])
def get_gauntlets():
    # We only need to send the name and description to the frontend
    gauntlet_list = {gid: {"name": g["name"], "description": g["description"]} for gid, g in GAUNTLETS.items()}
    return jsonify(gauntlet_list)


@bp.route('/evaluate', methods=['POST'])
def evaluate_prompt():
    data = request.get_json()
    user_prompt = data.get('prompt')
    gauntlet_id = data.get('gauntlet_id') # Get the selected gauntlet

    if not all([user_prompt, gauntlet_id]):
        return jsonify({"error": "Missing prompt or gauntlet_id"}), 400

    result = run_gauntlet_evaluation(gauntlet_id, user_prompt)

    if "error" in result:
        return jsonify(result), 500

    return jsonify(result)