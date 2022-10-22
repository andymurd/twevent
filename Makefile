SERVER_JS_FILES=app.js $(shell find ./server -name \*.js -print)
CLIENT_JS_FILES=$(shell find ./client -name \*.js -print)
LESS_FILES=$(shell find ./less -name \*.less -print)

.phony: build run test install

all: build

build: js css fonts

install: build

run: build
	node app.js

fonts:
	@echo "Copying fonts"
	@mkdir -p public/fonts
	@cp third_party/fortawesome/fontawesome/font/*webfont* public/fonts

public/stylesheets/style.min.css: $(LESS_FILES)
	@echo "Making CSS"
	@node_modules/recess/bin/recess --compress less/style.less > public/stylesheets/style.min.css

css: public/stylesheets/style.min.css

public/javascripts/twevent.min.js: js-static-analysis
	@echo "Compressing JavaScript"
	@node_modules/.bin/uglifyjs $(CLIENT_JS_FILES) > public/javascripts/twevent.min.js

js-static-analysis: $(SERVER_JS_FILES) $(CLIENT_JS_FILES)
	@echo "Analysing JavaScript"
	@node_modules/.bin/jshint --config .jshintrc-server $(SERVER_JS_FILES)
	@node_modules/.bin/jshint --config .jshintrc-client $(CLIENT_JS_FILES)

js: public/javascripts/twevent.min.js

bootstrap:
	cd third_party/twitter/bootstrap && npm install
	@make -C third_party/twitter/bootstrap

