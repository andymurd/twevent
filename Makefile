SERVER_JS_FILES=app.js $(shell find ./server -name \*.js -print)
CLIENT_JS_FILES=$(shell find ./client -name \*.js -print)
LESS_FILES=$(shell find ./less -name \*.less -print)

.phony: build run test install

all: build

build: js css fonts

install: bootstrap build

run: build
	node app.js

fonts:
	@echo "Copying fonts"
	@mkdir -p public/fonts
	@cp third_party/fortawesome/fontawesome/font/*webfont* public/fonts

css: $(LESS_FILES)
	@echo "Making CSS"
	@./third_party/twitter/bootstrap/node_modules/recess/bin/recess --compress less/style.less > public/stylesheets/style.min.css

js: js-static-analysis
	@echo "Compressing JavaScript"
	@uglifyjs $(CLIENT_JS_FILES) > public/javascripts/twevent.min.js

js-static-analysis: $(SERVER_JS_FILES) $(CLIENT_JS_FILES)
	@echo "Analysing JavaScript"
	@jshint --config .jshintrc-server $(SERVER_JS_FILES)
	@jshint --config .jshintrc-client $(CLIENT_JS_FILES)

bootstrap:
	@make -C third_party/twitter/bootstrap

