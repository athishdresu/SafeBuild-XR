import requests

url = 'http://127.0.0.1:5000/input_code'
data = {"pin": "0000"}

print("Starting SafeBuild XR Backend Test...")

for i in range(1, 5):
    print(f"\n Sending Attempt {i}...")
    response = requests.post(url, json=data)
    if response.status_code == 200:
        print("Server replied:", response.json())
    else:
        print(f"SERVER CRASHED! (Status Code: {response.status_code})")
        print("Raw Error from Flask:", response.text[:200], "...") 
        break