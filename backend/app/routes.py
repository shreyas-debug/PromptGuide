from flask import Blueprint, jsonify, request
from .services import run_metric_based_evaluation, refine_prompt_with_llm

bp = Blueprint('api', __name__, url_prefix='/api')

@bp.route('/evaluate', methods=['POST'])
def evaluate_prompt():
    data = request.get_json()
    user_prompt = data.get('prompt')

    if not user_prompt:
        return jsonify({"error": "No prompt provided"}), 400

    # Call the new metric-based function
    result = run_metric_based_evaluation(user_prompt)

    if "error" in result:
        return jsonify(result), 500

    # This returns a standard JSON response, not a stream
    return jsonify(result)


@bp.route('/refine', methods=['POST'])
def refine_prompt():
    data = request.get_json()
    original_prompt = data.get('original_prompt')
    score = data.get('score')
    feedback = data.get('feedback')

    if not all([original_prompt, score is not None, feedback]):
        return jsonify({"error": "Missing data for refinement"}), 400

    result = refine_prompt_with_llm(original_prompt, score, feedback)

    if "error" in result:
        return jsonify(result), 500

    return jsonify(result)