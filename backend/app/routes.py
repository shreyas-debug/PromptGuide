from flask import Blueprint, jsonify, request
from .services import run_metric_based_evaluation, refine_prompt_with_llm, GAUNTLETS

bp = Blueprint('api', __name__, url_prefix='/api')


@bp.route('/gauntlets', methods=['GET'])
def get_gauntlets_route():
    gauntlet_list = {gid: {"name": g["name"]} for gid, g in GAUNTLETS.items()}
    return jsonify(gauntlet_list)


@bp.route('/evaluate', methods=['POST'])
def evaluate_prompt_route():
    data = request.get_json()
    user_prompt = data.get('user_prompt')
    if not user_prompt: return jsonify({"error": "No prompt provided"}), 400
    result = run_metric_based_evaluation(user_prompt)
    return jsonify({"evaluation": result})


@bp.route('/refine', methods=['POST'])
def refine_prompt_route():
    data = request.get_json()
    original_prompt = data.get('original_prompt')
    score = data.get('score')
    feedback = data.get('feedback')
    gauntlet_id = data.get('gauntlet_id')

    if not all([original_prompt, score is not None, feedback, gauntlet_id]):
        return jsonify({"error": "Missing data for refinement"}), 400

    result = refine_prompt_with_llm(original_prompt, score, feedback, gauntlet_id)
    return jsonify(result)