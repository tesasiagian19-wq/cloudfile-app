from flask import Flask, request, jsonify # type: ignore
from flask_cors import CORS # type: ignore
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity # type: ignore
from werkzeug.utils import secure_filename # type: ignore
from datetime import datetime, timedelta
import os, boto3, redis, logging # type: ignore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)
app.config['JWT_SECRET_KEY'] = 'rahasia12345'
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=1)
jwt = JWTManager(app)

# Redis
try:
    redis_client = redis.Redis(host='localhost', port=6379, decode_responses=True)
    redis_client.ping()
    redis_ok = True
except:
    redis_client = None
    redis_ok = False

# MinIO
try:
    s3_client = boto3.client('s3', endpoint_url='http://localhost:9000',
        aws_access_key_id='tecy', aws_secret_access_key='tecy2004', region_name='us-east-1')
    s3_client.list_buckets()
    s3_ok = True
except:
    s3_client = None
    s3_ok = False

users_db = {
    'demo@cloud.com': {'password': 'demo123', 'name': 'Demo User', 'storage_limit': 1073741824, 'used_storage': 0}
}

def format_size(b):
    for unit in ['B', 'KB', 'MB', 'GB']:
        if b < 1024: return f"{b:.2f} {unit}"
        b /= 1024
    return f"{b:.2f} TB"

@app.route('/')
def home():
    return jsonify({'app': 'CloudFile API', 'status': 'running'})

@app.route('/health')
def health():
    return jsonify({'status': 'healthy', 'redis': redis_ok, 'minio': s3_ok})

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    name = data.get('name', '')
    if not email or not password:
        return jsonify({'error': True, 'message': 'Email dan password harus diisi'}), 400
    if len(password) < 6:
        return jsonify({'error': True, 'message': 'Password minimal 6 karakter'}), 400
    if email in users_db:
        return jsonify({'error': True, 'message': 'Email sudah terdaftar'}), 409
    users_db[email] = {'password': password, 'name': name, 'storage_limit': 1073741824, 'used_storage': 0}
    return jsonify({'error': False, 'message': 'Registrasi berhasil! Silakan login.'}), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    if email not in users_db:
        return jsonify({'error': True, 'message': 'Email tidak terdaftar'}), 401
    user = users_db[email]
    if user['password'] != password:
        return jsonify({'error': True, 'message': 'Password salah'}), 401
    access_token = create_access_token(identity=email)
    return jsonify({'error': False, 'message': 'Login berhasil', 'token': access_token,
        'user': {'email': email, 'name': user['name']}})

@app.route('/api/files/upload', methods=['POST'])
@jwt_required()
def upload_file():
    current_user = get_jwt_identity()
    if 'file' not in request.files:
        return jsonify({'error': True, 'message': 'Tidak ada file'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': True, 'message': 'File tidak dipilih'}), 400
    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)
    user = users_db[current_user]
    if user['used_storage'] + file_size > user['storage_limit']:
        return jsonify({'error': True, 'message': 'Storage penuh!'}), 413
    filename = secure_filename(file.filename)
    object_path = f"{current_user}/{datetime.now().strftime('%Y%m%d_%H%M%S')}_{filename}"
    if s3_client:
        try:
            s3_client.upload_fileobj(file, 'cloudfile-storage', object_path)
        except:
            return jsonify({'error': True, 'message': 'Gagal upload'}), 500
    else:
        return jsonify({'error': True, 'message': 'Cloud storage tidak tersedia'}), 503
    user['used_storage'] += file_size
    return jsonify({'error': False, 'message': 'Upload berhasil!',
        'file': {'name': filename, 'size': file_size, 'size_readable': format_size(file_size)}}), 201

@app.route('/api/files', methods=['GET'])
@jwt_required()
def list_files():
    current_user = get_jwt_identity()
    files = []
    if s3_client:
        try:
            response = s3_client.list_objects_v2(Bucket='cloudfile-storage', Prefix=f"{current_user}/")
            if 'Contents' in response:
                for obj in response['Contents']:
                    files.append({'name': obj['Key'].split('/')[-1], 'path': obj['Key'],
                        'size': obj['Size'], 'size_readable': format_size(obj['Size']),
                        'last_modified': obj['LastModified'].isoformat()})
        except:
            pass
    return jsonify({'error': False, 'total': len(files), 'files': files})

@app.route('/api/files/download/<path:filename>', methods=['GET'])
@jwt_required()
def download_file(filename):
    current_user = get_jwt_identity()
    object_path = f"{current_user}/{filename}"
    if not s3_client:
        return jsonify({'error': True, 'message': 'Storage tidak tersedia'}), 503
    try:
        url = s3_client.generate_presigned_url('get_object',
            Params={'Bucket': 'cloudfile-storage', 'Key': object_path}, ExpiresIn=300)
        return jsonify({'error': False, 'download_url': url, 'filename': filename})
    except:
        return jsonify({'error': True, 'message': 'File tidak ditemukan'}), 404

@app.route('/api/files/delete/<path:filename>', methods=['DELETE'])
@jwt_required()
def delete_file(filename):
    current_user = get_jwt_identity()
    object_path = f"{current_user}/{filename}"
    if not s3_client:
        return jsonify({'error': True, 'message': 'Storage tidak tersedia'}), 503
    try:
        s3_client.delete_object(Bucket='cloudfile-storage', Key=object_path)
        return jsonify({'error': False, 'message': 'File berhasil dihapus'})
    except:
        return jsonify({'error': True, 'message': 'Gagal menghapus'}), 500

@app.route('/api/storage/info', methods=['GET'])
@jwt_required()
def storage_info():
    current_user = get_jwt_identity()
    user = users_db[current_user]
    return jsonify({'error': False, 'used_bytes': user['used_storage'],
        'limit_bytes': user['storage_limit'],
        'used_readable': format_size(user['used_storage']),
        'limit_readable': format_size(user['storage_limit']),
        'percentage': round((user['used_storage'] / user['storage_limit']) * 100, 2)})

if __name__ == '__main__':
    print("=" * 50)
    print("CLOUDFILE API STARTING...")
    print(f"Cloud Storage: {'OK' if s3_ok else 'NOT READY'}")
    print(f"Cache: {'OK' if redis_ok else 'NOT READY'}")
    print("Demo: demo@cloud.com / demo123")
    print("=" * 50)
    if s3_client:
        try:
            s3_client.head_bucket(Bucket='cloudfile-storage')
        except:
            s3_client.create_bucket(Bucket='cloudfile-storage')
            print("Bucket created")
    app.run(host='0.0.0.0', port=5000, debug=True)