'use strict';

module.exports = function (RED) {

    var socketTimeout = RED.settings.socketTimeout || null;

    function TcpServer(config) {

        var net = require('net'); //https://nodejs.org/api/net.html
        var crypto = require('crypto');

        RED.nodes.createNode(this, config);

        this.action = config.action || "listen"; /* listen,close,write */
        this.port = config.port * 1;
        this.topic = config.topic;
        this.stream = (!config.datamode || config.datamode=='stream'); /* stream,single*/
        this.datatype = config.datatype || 'buffer'; /* buffer,utf8,base64,xml */
        this.newline = (config.newline || "").replace("\\n","\n").replace("\\r","\r");

        var node = this;
        
        var connectionPool = {};
        var server;
		
        node.on('input', function (msg, nodeSend, nodeDone) {

            if (config.actionType === 'msg' || config.actionType === 'flow' || config.actionType === 'global') {
                node.action = RED.util.evaluateNodeProperty(config.action, config.actionType, this, msg);
            }

            if (config.portType === 'msg' || config.portType === 'flow' || config.portType === 'global') {
                node.port = (RED.util.evaluateNodeProperty(config.port, config.portType, this, msg)) * 1;
            }

            var configure = (id) => {

                var socket = connectionPool[id].socket;

                socket.setKeepAlive(true, 120000);

                if (socketTimeout !== null) {
                    socket.setTimeout(socketTimeout);
                }

                socket.on('data', (data) => {

                    if (node.datatype != 'buffer') {
                        data = data.toString(node.datatype == 'xml' ? 'utf8' : node.datatype);
                    }
    
                    var buffer = connectionPool[id].buffer;
    
                    if (node.stream) {
    
                        var result = {
                            topic: msg.topic || config.topic,
                            _address: socket.remoteAddress,
                            _port: socket.remotePort,
                            _id: id
                        };
    
                        if ((typeof data) === "string" && node.newline !== "") {
    
                            buffer = buffer + data;
                            var parts = buffer.split(node.newline);
    
                            for (var i = 0; i < parts.length - 1; i += 1) {
                                
                                result.payload = parts[i];
    
                                if (node.datatype == 'xml') {
    
                                    var xml2js = require('xml2js');
                                    var parseXml = xml2js.parseString;
    
                                    var parseOpts = {
                                        async: true,
                                        attrkey: (config.xmlAttrkey || '$'),
                                        charkey: (config.xmlCharkey || '_'),
                                        explicitArray:  config.xmlArray,
                                        normalizeTags: config.xmlNormalizeTags,
                                        normalize: config.xmlNormalize
                                    };
    
                                    if (config.xmlStrip) {
                                        var stripPrefix = require('xml2js').processors.stripPrefix;
                                        parseOpts.tagNameProcessors = [ stripPrefix ];
                                        parseOpts.attrNameProcessors = [ stripPrefix ];
                                    }
    
                                    var parseStr = result.payload.replace(/^[\x00\s]*/g, ""); //Non-whitespace before first tag
                                    parseStr += node.newline;
    
                                    parseXml(parseStr, parseOpts, function (parseErr, parseResult) {
                                        if (!parseErr) { 
                                            result.payload = parseResult;
                                            nodeSend(result);
                                        }
                                    });
    
                                }
                                else {
                                    nodeSend(result);
                                }
    
                            }
    
                            buffer = parts[parts.length - 1];
    
                        }
                        else {
                            result.payload = data;
                            nodeSend(result);
                        }
    
                    }
                    else {
    
                        if ((typeof data) === "string") {
                            buffer = buffer + data;
                        }
                        else {
                            buffer = Buffer.concat([buffer, data], buffer.length + data.length);
                        }
    
                    }
    
                    connectionPool[id].buffer = buffer;

                });

                socket.on('end', function () {
                    if (!node.stream || (node.datatype === "utf8" && node.newline !== "")) {
                        var buffer = connectionPool[id].buffer;
                        if (buffer.length > 0) nodeSend({ topic: msg.topic || config.topic, payload: buffer, _address: socket.remoteAddress, _port: socket.remotePort, _id: id });
                        connectionPool[id].buffer = null;
                    }
                });

                socket.on('timeout', function () {
                    socket.end();
                });

                socket.on('close', function () {
                    delete connectionPool[id];
                });

                socket.on('error', function (err) {
                    node.log(err);
                });

            };

            var close = () => {
                //close by remote address and port
            };

            var write = () => {

            };

            var kill = () => {

            };

            var listen = () => {

                if (typeof server === 'undefined') {
    
                    server = net.createServer(function (socket) {

                        var id = crypto.createHash('md5').update(`${socket.localAddress}${socket.localPort}${socket.remoteAddress}${socket.remotePort}`).digest("hex");

                        connectionPool[id] = {
                            socket: socket,
                            buffer: (node.datatype == 'buffer') ? Buffer.alloc(0) : ""
                        };
                        
                        configure(id);
        
                    });
                    
                    server.on('error', function (err) {
                        if (err) node.error(err);
                    });
    
                }

                server.listen(node.port, function (err) {
                    if (err) node.error(err);
                });

            };
            
            switch (node.action.toLowerCase()) {
                case 'close':
                    close();
                    break;
                case 'write':
                    write();
                    break;
                case 'kill':
                    kill();
                    break;
                default:
                    listen();
            }

        });

        node.on("close",function() {
            node.status({});
        });

    };

    RED.nodes.registerType("tcp-server", TcpServer);

};