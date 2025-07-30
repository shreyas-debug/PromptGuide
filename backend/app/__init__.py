from flask import Flask
from flask_cors import CORS

def create_app():
    app = Flask(__name__)
    # This allows requests from your frontend's origin
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    from . import routes
    app.register_blueprint(routes.bp)

    return app