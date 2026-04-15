from flask import Flask, request, jsonify
from google import genai
app = Flask(__name__)
client = genai.Client(api_key="AIzaSyAVYLX-1xmoPJDfcjlVzEfeQ8iPaNvswmM")
CORRECT_PIN = "1010" 
attempt_count = 0
max_attempts = 3

@app.route('/input_code', methods=['POST'])
def input_code():
    global attempt_count
    data = request.get_json()
    user_input = data.get("pin")
    if attempt_count >= max_attempts:
        prompt = "Explain in 2 short sentences to a beginner electronics student why failing a 3-attempt limit triggers a D Flip-Flop to latch high and permanently lock a circuit."
        
        try:
            # Try to get the real AI response
            response = client.models.generate_content(
                model='gemini-2.0-flash',
                contents=prompt
            )
            ai_explanation = response.text
        except Exception as e:
            ai_explanation = "The circuit has reached its maximum flip-flop state. The latch is permanently high, cutting power to the solenoid."
            
        return jsonify({
            "state": "LOCKED",
            "led": "RED_FLASHING",
            "message": "Safe is permanently locked.",
            "tutor_note": ai_explanation 
        })
    if user_input == CORRECT_PIN:
        attempt_count = 0
        return jsonify({
            "state": "OPEN",
            "led": "GREEN",
            "message": "Comparator Output: HIGH. Door opened!"
        })
    else:
        attempt_count += 1
        attempts_left = max_attempts - attempt_count
        return jsonify({
            "state": "ERROR",
            "led": "RED",
            "message": f"Incorrect logic sequence. {attempts_left} attempts remaining."
        })
if __name__ == '__main__':
    app.run(debug=True, port=5000)