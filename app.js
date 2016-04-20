(function() {
  // jQuery.Event.which key codes. These should be normalized across browsers
  var keyCode = {
    BACKSPACE: 8,
    ENTER: 13,
    COMMA: 44
  };

  return {
    events: {
      'app.activated': 'init',
      'click #send-msg': 'sendMsg',
      'click a.close': 'onMessageCloseClick',
      'keyup .message': 'onNewMessageKeyUp',
      'keypress .message': 'onNewMessageKeyPress',
      'notification.notificationMessage': 'onIncomingMessage',
      'click .new-message': 'onNewMessageClick',
      'click .cancel': 'onCancelClick',
      'click .token .delete': 'onTokenDelete',
      'click .token_list': 'onTokenListClick',
      'keypress .add_token input': 'onTokenInputKeyPress',
      'keyup .add_token input': 'onTokenInputKeyUp',
      'focusin .add_token input': 'onTokenInputFocusIn',
      'focusout .add_token input': 'onTokenInputFocusOut'
    },

    requests: {
      sendMsg: function(text, groupIds) {
        return {
          url: '/api/v2/apps/notify.json',
          type: 'POST',
          data: {
            event: 'notificationMessage',
            body: {
              text: text,
              groupIds: groupIds
            },
            app_id: this.id()
          }
        };
      },

      getAssignableGroups: function(page) {
        return {
          url: helpers.fmt('/api/v2/groups/assignable.json?page=%@', page),
          type: 'GET'
        };
      },

      getMyGroups: function() {
        return {
          url: '/api/v2/users/%@/group_memberships.json'.fmt(this.currentUser().id()),
          type: 'GET'
        };
      }
    },

    notifications: null,
    myGroupIds: null,
    groups: null,

    init: function() {
      var self = this;

      this.notifications = [];
      this.myGroupIds    = [];
      this.groups        = {};

      this.ajax('getMyGroups').done(function(data) {
        var groupMemberships = data.group_memberships;
        self.myGroupIds = _.map(groupMemberships, function(group) {
          return group.group_id;
        });
      });

      this.loadAllGroups().then(function(groupChunks) {
        groupChunks.forEach(function(groupChunk) {
          groupChunk.groups.forEach(function(group) {
            self.groups[group.name] = group.id;
          });
        });
        self.drawInbox();
      });
    },

    drawInbox: function() {
      var isAdmin = (this.currentUser().role() === "admin");
      this.switchTo('inbox', {
        isAdmin: isAdmin
      });
      this.notifications.forEach(function(notification) {
        this.addMsgToWindow(notification.message, notification.sender);
      }, this);
    },

    messageBox: function() {
      return this.$('textarea.message');
    },

    onNewMessageClick: function(event) {
      event.preventDefault();
      this.switchTo('admin');
      this.$('.groups input').autocomplete({
        source: _.keys(this.groups)
      });
      this.messageBox().focus();
    },

    onCancelClick: function(event) {
      event.preventDefault();
      this.drawInbox();
    },

    messageBoxValue: function() {
      return this.messageBox().val();
    },

    isMessageEmpty: function() {
      return !this.messageBoxValue().trim();
    },

    sendMsg: function() {
      var unknownGroups = _.difference(this.tokenValues(), _.keys(this.groups)),
          self = this,
          $groups;

      if (!_.isEmpty(unknownGroups)) {
        $groups = this.$('.token_list .token span');

        _.each(unknownGroups, function(groupName) {
          $groups.each(function(index, group) {
            var $group = self.$(group);
            if ($group.text() == groupName) {
              $group.closest('.token').addClass('unknown');
            }
          });
        });

        return;
      }
      var groupIds = _.pick(this.groups, this.tokenValues());

      this.ajax('sendMsg', this.messageBoxValue(), groupIds);
      this.drawInbox();
    },

    tokenValues: function() {
      return _.map(this.$('.token_list .token span'), function(token) {
        return token.textContent;
      });
    },

    onNewMessageKeyUp: function() {
      this.$('#send-msg').prop('disabled', this.isMessageEmpty());
    },

    onNewMessageKeyPress: function(event) {
      if (this.isMessageEmpty()) { return; }

      if ((event.ctrlKey || event.metaKey) && event.which === keyCode.ENTER) {
        this.sendMsg();
      }
    },

    REGEXP_URL: /https?:\/\/(\S+)/i,
    REGEXP_IMAGE: /\.(png|gif|bmp|jpg|jpeg|ico)$/i,
    REPLACEMENTS: [
      [/^### (.+?)$/m, "<h3>$1</h3>"],
      [/(\*\*|__)(.+?)\1/, "<strong>$2</strong>"],
      [/(\*|_)(.+?)\1/, "<em>$2</em>"],
      [/!\[(.*?)\]\((.+?)\)/, '<img src="$2" alt="$1">'],
      [/\[(.+?)\]\((\/.+?)\)/, '<a href="$2">$1</a>'],
      [/\[(.+?)\]\((https?:\/\/.+?)\)/, '<a href="$2" target="_blank">$1</a>']
    ],

    markdown: function(source) {
      var buffer = [],
          count = 0,
          match = null,
          pair, regex, replacement;

      for (var index = 0; index < this.REPLACEMENTS.length; ++index) {
        pair = this.REPLACEMENTS[index];
        regex = pair[0];
        replacement = pair[1];

        while ((match = source.match(regex))) {
          buffer.push(match[0].replace(regex, replacement));
          source = source.replace(match[0], ['@@', count, '@@'].join(''));
          ++count;
        }
      }

      while ((match = source.match(this.REGEXP_URL))) {
        if (match[0].match(this.REGEXP_IMAGE)) {
          replacement = '<img src="%@" alt="%@">'.fmt(match[0], match[0]);
        } else {
          replacement = '<a href="%@" target="_blank">%@</a>'.fmt(match[0], match[0]);
        }
        source = source.replace(match[0], ['@@', count, '@@'].join(''));
        buffer.push(replacement);
        ++count;
      }

      _.each(buffer, function(value, index) {
        source = source.replace(['@@', index, '@@'].join(''), value);
      });
      return source;
    },

    onMessageCloseClick: function(event) {
      event.preventDefault();
      var $notification = this.$(event.target).parent();
      this.notifications = _.reject(this.notifications, function(notification) {
        return notification.message.uuid === $notification.data('uuid');
      });
      $notification.remove();
    },

    onIncomingMessage: function(message, sender) {
      if (sender.email() === this.currentUser().email() || sender.role() !== 'admin') {
        return false;
      }

      var targetGroupIds = _.map(message.groupIds, function(id) { return parseInt(id, 10); });
      if (message.groupIds && !_.intersection(this.myGroupIds, targetGroupIds).length) {
        return false;
      }

      message.uuid = _.uniqueId('msg');

      // Store notification so that we can re-render it later
      this.notifications.push({
        message: message,
        sender: sender,
      });

      try { this.popover(); } catch(err) {}

      // defer ensures app is in DOM before we add a message
      _.defer(this.addMsgToWindow.bind(this), message, sender);
    },

    addMsgToWindow: function(message, sender) {
      this.$('.placeholder').hide();

      // We get sent two messages, so this makes sure we only display
      // each unique message once:
      if (this.$('li.message[data-uuid=%@]'.fmt(message.uuid)).length > 0) {
        return false;
      }

      // escape HTML
      var text = this.$('<div/>').text(message.text).html();
      text = this.markdown(text);

      var messageHTML = this.renderTemplate('message', {
        uuid: message.uuid,
        text: text,
        senderName: sender.name(),
        date: (new Date()).toLocaleString()
      });

      this.$('ul#messages').prepend(messageHTML);
    },

    onTokenInputKeyPress: function(event) {
      // Create a new token when the enter or comma keys are pressed
      if (event.which === keyCode.ENTER || event.which === keyCode.COMMA) {
        this.addTokenFromInput(event.target);
        // Prevent the character from being entered into the form input
        return false;
      }
    },

    onTokenInputKeyUp: function(event) {
      // Remove last token on backspace
      if (event.which == keyCode.BACKSPACE && event.target.value.length <= 0) {
        this.$(event.target).parents('.token_list')
                            .children('.token')
                            .last()
                            .remove();
      }
    },

    onTokenListClick: function(event) {
      var input = this.$(event.target).children('.add_token')
                                      .children('input')[0];
      if (input !== undefined) {
        input.focus();
      }
    },

    onTokenInputFocusIn: function(event) {
      var $tokenList = this.$(event.target).parents('.token_list');
      $tokenList.removeClass('ui-state-default');
      $tokenList.addClass('ui-state-focus');
    },

    onTokenInputFocusOut: function(event) {
      var $tokenList = this.$(event.target).parents('.token_list');
      $tokenList.removeClass('ui-state-focus');
      $tokenList.addClass('ui-state-default');
      this.addTokenFromInput(event.target);
    },

    addTokenFromInput: function(input) {
      if (input.value.length > 0) {
        var tokenHTML = this.renderTemplate('group-token', { groupName: input.value });
        this.$(input.parentElement).before(tokenHTML);
        input.value = '';
      }
    },

    onTokenDelete: function(e) {
      this.$(e.target).parent('li.token').remove();
    },

    loadAllGroups: function() {
      var self = this;

      return this.promise(function(done) {
        self.groupRequests().then(function(requests) {
          self.when.apply(self, requests).then(function() {
            if (requests.length === 1) {
              done([arguments[0]]);
            } else if (requests.length > 1) {
              done(_.pluck(arguments, 0));
            } else {
              done([]);
            }
          });
        });
      });
    },

    groupRequests: function() {
      var self = this;

      return this.promise(function(done) {
        var first_page = this.ajax('getAssignableGroups', 1);

        first_page.then(function(data){
          var pages = Math.ceil(data.count / 100);

          done([first_page].concat(_.range(2, pages + 1).map(function(page) {
            return self.ajax('getAssignableGroups', page);
          })));
        });
      });
    }
  };

}());
