CC = gcc
CFLAGS = -std=c11 -Wall -Wextra -Wpedantic
TARGET = minesweeper

$(TARGET): test.c game.c game.h
	$(CC) $(CFLAGS) -o $(TARGET) test.c game.c

clean:
	rm -f $(TARGET)

.PHONY: clean
