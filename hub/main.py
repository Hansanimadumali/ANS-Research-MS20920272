import yaml
import paho.mqtt.client as mqtt
import time
import keycloak
import json

connectedBroker = False
coonectedAuth = False

# read configuration files
def readConfig():
    file = open('config.yaml','r')
    cfg = yaml.load(file)
    return cfg



# read yaml configurations
settings = readConfig()

# +++++++++++++++++++++++++++++++++++++++++++++++++++++
#               Auth flow
# +++++++++++++++++++++++++++++++++++++++++++++++++++++

server_url="http://"+settings["auth_server"]["server_url"]+":"+str(settings["auth_server"]["server_port"])+"/auth/"

print("Connecting to "+server_url)

# Configure client
keycloak_openid = keycloak.KeycloakOpenID(server_url=server_url,
                    client_id=settings["auth_server"]["client_id"],
                    realm_name=settings["auth_server"]["realm_name"],
                    client_secret_key=settings["auth_server"]["client_secret"])
config_well_know = keycloak_openid.well_know()

KEYCLOAK_PUBLIC_KEY = keycloak_openid.public_key()
optionsAccessToken = {"verify_signature": True, "verify_aud": True, "exp": True}

def verifyToken(token):
    token_info = keycloak_openid.introspect(token)
    # token_info = keycloak_openid.decode_token(token, key=KEYCLOAK_PUBLIC_KEY, options=optionsAccessToken)
    return token_info

######################################################
##      MQTT Callbacks
######################################################


def on_message(client, userdata, message):
    # print("message received", str(message.payload.decode("utf-8")))
    print("message topic=",message.topic)
    print("message qos=",message.qos)
    # print("message retain flag=",message.retain)

    payload = str(message.payload.decode("utf-8"))
    jsonAcceptableString = payload.replace("'","\"")
    jsonPayload = json.loads(jsonAcceptableString)

    # Introspect Token
    token_info = verifyToken(jsonPayload["authToken"])
    print(token_info[u'active'])
    if(token_info[u'active']):
        print("++++++++++ Authenticated Data ++++++++++++++++++")
        print(jsonPayload["payload"])
    else:
        print("---------- Unauthenticated Data ----------------")

def on_connect(client, userdata, flags, rc):
    print(rc)
    if rc == 0:
        print("Connected to broker")
        connectedBroker = True                #Signal connection 
        client.subscribe(settings["mqtt"]["topic"])
    else:
        print("Connection failed")

def on_subscribe(topic):
    print("Subscribing to topic :" + topic)


######################################################
##      Main flow
######################################################



# +++++++++++++++++++++++++++++++++++++++++++++++++++++
#               MQTT flow
# +++++++++++++++++++++++++++++++++++++++++++++++++++++

# setting up mqtt client
client = mqtt.Client(settings["mqtt"]["client_name"])
client.username_pw_set(settings["mqtt"]["username"],settings["mqtt"]["password"])

client.loop_start()

# callbacks
client.on_connect= on_connect

client.connect(settings["mqtt"]["ip"],port=settings["mqtt"]["port"])
print("Waiting for connection for "+settings["mqtt"]["ip"]+"....")


client.on_subscribe = on_subscribe
client.on_message=on_message

# connection waiting loop
while connectedBroker != True:    #Wait for connection
   time.sleep(1)

# main waiting loop
try:
    while True:
        time.sleep(1)
 
except KeyboardInterrupt:
    print("Existing")
    client.disconnect()
    client.loop_stop()










