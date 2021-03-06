'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _moment = require('moment');

var _moment2 = _interopRequireDefault(_moment);

var _MemoryStorage = require('./MemoryStorage');

var _MemoryStorage2 = _interopRequireDefault(_MemoryStorage);

var _Protocol = require('./Protocol');

var Protocol = _interopRequireWildcard(_Protocol);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var HttpPack = function () {
    function HttpPack(options) {
        _classCallCheck(this, HttpPack);

        if (options == undefined) {
            options = {};
        }
        this.storage = options['storage'] || new _MemoryStorage2.default();
    }

    _createClass(HttpPack, [{
        key: 'generateRetryPacket',
        value: function generateRetryPacket(packet) {
            if (packet.qos == Protocol.QoS0) {
                return null;
            } else {
                if (packet.retryTimes != undefined && packet.retryTimes > 0) {
                    var retryPacket = _lodash2.default.cloneDeep(packet);
                    retryPacket.retryTimes++;
                    retryPacket.timestamp = (0, _moment2.default)().add(retryPacket.retryTimes * 5, 's').unix();
                    return retryPacket;
                } else {
                    var _retryPacket = Protocol.Encode(packet.msgType, packet.qos, 1, packet.identifier, packet.payload);
                    _retryPacket.retryTimes = 1;
                    _retryPacket.timestamp = (0, _moment2.default)().add(_retryPacket.retryTimes * 5, 's').unix();
                    return _retryPacket;
                }
            }
        }
    }, {
        key: 'handlePacket',
        value: function handlePacket(packet, callback) {
            if (packet.msgType == Protocol.MSG_TYPE_SEND) {
                if (packet.qos == Protocol.QoS0) {
                    callback(packet.payload);
                    return null;
                } else if (packet.qos == Protocol.QoS1) {
                    var replyPacket = Protocol.Encode(Protocol.MSG_TYPE_ACK, Protocol.QoS0, 0, packet.identifier);
                    replyPacket.timestamp = (0, _moment2.default)().unix();
                    return this.storage.savePacket(replyPacket).then(function () {
                        callback(packet.payload);
                    }.bind(this));
                } else if (packet.qos == Protocol.QoS2) {
                    return this.storage.receivePacket(packet.identifier, packet.payload).then(function () {
                        var replyPacket = Protocol.Encode(Protocol.MSG_TYPE_RECEIVED, Protocol.QoS0, 0, packet.identifier);
                        replyPacket.timestamp = (0, _moment2.default)().unix();
                        return this.storage.savePacket(replyPacket);
                    }.bind(this));
                }
            } else if (packet.msgType == Protocol.MSG_TYPE_ACK) {
                return this.storage.confirmPacket(packet.identifier);
            } else if (packet.msgType == Protocol.MSG_TYPE_RECEIVED) {
                return this.storage.confirmPacket(packet.identifier).then(function () {
                    var replyPacket = Protocol.Encode(Protocol.MSG_TYPE_RELEASE, Protocol.QoS1, 0, packet.identifier);
                    replyPacket.timestamp = (0, _moment2.default)().unix();
                    return this.storage.savePacket(replyPacket);
                }.bind(this));
            } else if (packet.msgType == Protocol.MSG_TYPE_RELEASE) {
                return this.storage.releasePacket(packet.identifier).then(function (payload) {
                    if (payload != undefined) {
                        callback(payload);
                    }
                    var replyPacket = Protocol.Encode(Protocol.MSG_TYPE_COMPLETED, Protocol.QoS0, 0, packet.identifier);
                    replyPacket.timestamp = (0, _moment2.default)().unix();
                    return this.storage.savePacket(replyPacket);
                }.bind(this));
            } else if (packet.msgType == Protocol.MSG_TYPE_COMPLETED) {
                return this.storage.confirmPacket(packet.identifier);
            }
        }
    }, {
        key: 'combinePacket',
        value: function combinePacket(packets) {
            var buffers = _lodash2.default.map(packets, function (packet) {
                return packet.buffer;
            }.bind(this));
            return Buffer.concat(buffers);
        }
    }, {
        key: 'splitBuffer',
        value: function splitBuffer(buffer) {
            var packets = [];
            var length = buffer.length;
            var offset = 0;
            while (offset < buffer.length) {
                var packet = Protocol.Decode(buffer, offset);
                packets.push(packet);
                offset += packet.totalLength;
            }
            return packets;
        }

        // Public method

    }, {
        key: 'commit',
        value: function commit(payload) {
            var qos = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : Protocol.QoS0;

            if (typeof payload == 'string') {
                payload = new Buffer(payload, 'utf-8');
            }
            return this.storage.generateId().then(function (id) {
                var packet = Protocol.Encode(Protocol.MSG_TYPE_SEND, qos, 0, id, payload);
                packet.timestamp = (0, _moment2.default)().unix();
                return this.storage.savePacket(packet);
            }.bind(this));
        }
    }, {
        key: 'generateBody',
        value: function generateBody() {
            var respondPackets = this.storage.unconfirmedPacket(5);
            return respondPackets.then(function (packets) {
                var waitHandles = _lodash2.default.map(packets, function (packet) {
                    var retryPacket = this.generateRetryPacket(packet);
                    if (retryPacket != undefined) {
                        return this.storage.savePacket(retryPacket).then(function () {
                            return packet;
                        });
                    }
                    return packet;
                }.bind(this));
                return Promise.all(waitHandles).then(function (packets) {
                    return this.combinePacket(packets);
                }.bind(this));
            }.bind(this));
        }
    }, {
        key: 'parseBody',
        value: function parseBody(body, callback) {
            if (body == undefined) {
                var nullString = new Buffer('', 'utf-8');
                return Promise.resolve(nullString);
            }
            body = new Buffer(body, 'utf-8');
            var packets = this.splitBuffer(body);
            var waitHandles = _lodash2.default.map(packets, function (packet) {
                return this.handlePacket(packet, callback);
            }.bind(this));
            return Promise.all(waitHandles);
        }
    }]);

    return HttpPack;
}();

exports.default = HttpPack;
//# sourceMappingURL=HttpPack.js.map